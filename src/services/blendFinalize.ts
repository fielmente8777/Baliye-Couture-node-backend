import sharp from 'sharp';

import { saveGeneratedImage } from '@config/imageStore';
import { logger } from '@config/logger';
import { IImageJob, ImageJobModel } from '@models/imagejob';
import { DesignRenderModel } from '@models/designrender';
import { fetchAsset } from './embroideryCompositor';
import { DRIFT_LIMIT, embroideryDrift, restoreOutsideMask } from './garmentRender';

/**
 * Runs when a blend job (studio "apply" or customer "render") finishes at
 * Magnific, from the webhook or the polling fallback.
 *
 *   1. download the model's output
 *   2. copy every pixel OUTSIDE the embroidery back from the exact composite
 *   3. score how much the embroidery itself changed
 *   4. customer renders: if it changed too much, show the exact composite
 *
 * After this, colour, neckline and silhouette cannot differ from what the
 * customer picked, whatever the model did.
 */

/** Masks are stored as greyscale PNGs; read back as raw single-channel. */
export async function saveMask(mask: Buffer, width: number, height: number) {
  const png = await sharp(mask, { raw: { width, height, channels: 1 } }).png().toBuffer();
  return saveGeneratedImage(png.toString('base64'));
}

async function loadMask(url: string, width: number, height: number) {
  const png = await fetchAsset(url);
  return sharp(png)
    .extractChannel(0)
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer();
}

export async function finalizeBlendJob(jobId: string): Promise<void> {
  /* Claim atomically: the webhook and a polling refresh can arrive together. */
  const job = await ImageJobModel.findOneAndUpdate(
    {
      _id: jobId,
      status: 'completed',
      isFinalized: { $ne: true },
      compositeUrl: { $exists: true },
    },
    { $set: { isFinalized: true } },
    { new: true },
  ).exec();

  if (!job || !job.compositeUrl || !job.maskUrl) return;

  try {
    const composite = await fetchAsset(job.compositeUrl);
    const meta = await sharp(composite).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    const mask = await loadMask(job.maskUrl, width, height);
    const tight = await loadMask(job.tightMaskUrl ?? job.maskUrl, width, height);

    const raw = [...job.resultUrls];
    const restored: { url: string; drift: number }[] = [];

    for (const url of raw) {
      const generated = await fetchAsset(url);
      const merged = await restoreOutsideMask(composite, generated, mask);
      const drift = await embroideryDrift(composite, merged, tight);
      /* Our own copy: Magnific's result URLs expire within the hour. */
      restored.push({ url: await saveGeneratedImage(merged.toString('base64')), drift });
    }

    restored.sort((a, b) => a.drift - b.drift);
    const best = restored[0];

    job.rawResultUrls = raw;
    job.resultUrls = restored.map((r) => r.url);
    job.drift = best?.drift;
    if (best && best.drift > DRIFT_LIMIT) {
      job.error = `The AI changed the embroidery (drift ${best.drift.toFixed(2)}) — check before using`;
    }
    await job.save();

    if (job.renderKey) {
      const render = await DesignRenderModel.findOne({ key: job.renderKey }).exec();
      if (render) {
        const acceptable = best && best.drift <= DRIFT_LIMIT;
        render.status = 'ready';
        render.drift = best?.drift;
        /* A wrong-looking design is worse than a flatter one: fall back to
           the exact composite rather than show embroidery the model altered. */
        render.finalUrl = acceptable ? best.url : render.previewUrl;
        if (!acceptable) render.error = 'Blend rejected for drift — showing exact composite';
        await render.save();
      }
    }

    logger.info({ jobId, drift: best?.drift }, 'Blend job finalised');
  } catch (error) {
    logger.error({ err: error, jobId }, 'Could not finalise blend job');
    await ImageJobModel.updateOne(
      { _id: jobId },
      { $set: { isFinalized: false, error: 'Finalising failed — refresh to retry' } },
    ).exec();

    if (job.renderKey) {
      /* Pipeline update so finalUrl can copy previewUrl in one write. */
      await DesignRenderModel.updateOne({ key: job.renderKey, status: 'blending' }, [
        { $set: { status: 'ready', finalUrl: '$previewUrl', error: 'Finalising failed' } },
      ]).exec();
    }
  }
}

/** Call after any job status change (webhook or polling). */
export async function onJobSettled(job: IImageJob): Promise<void> {
  if (job.status === 'completed' && job.compositeUrl && !job.isFinalized) {
    await finalizeBlendJob(job._id.toString());
    return;
  }

  if (job.status === 'failed' && job.renderKey) {
    const render = await DesignRenderModel.findOne({ key: job.renderKey }).exec();
    if (render && render.status === 'blending') {
      render.status = 'ready';
      render.finalUrl = render.previewUrl;
      render.error = 'Blend failed — showing exact composite';
      await render.save();
    }
  }
}

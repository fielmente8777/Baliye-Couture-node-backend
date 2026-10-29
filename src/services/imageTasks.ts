import { onTaskSettled } from '@config/imageAI';
import { logger } from '@config/logger';
import { ImageJobModel } from '@models/imagejob';
import { onJobSettled } from './blendFinalize';
import { settleColourRender } from './colourRender';

/**
 * Finishes an ImageJob as soon as its OpenAI generation returns — the role
 * Magnific's webhook used to play. Polling (refreshJob) still works as a
 * fallback; the atomic `status: 'pending'` filter means whichever arrives
 * first wins and the other is a no-op.
 *
 * Imported for its side effect by the services that start generations.
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

onTaskSettled(async (task) => {
  /* Customer colour previews have no ImageJob — they keep their own row. */
  if (await settleColourRender(task)) return;

  const update =
    task.status === 'COMPLETED'
      ? { status: 'completed', resultUrls: task.generated, usage: task.usage }
      : { status: 'failed', error: task.error ?? 'Image generation failed' };

  /* The job document is written right after the task starts. A very fast
     generation (or a failure while loading inputs) can finish first, so
     retry briefly until it exists. */
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const job = await ImageJobModel.findOneAndUpdate(
      { taskId: task.task_id, status: 'pending' },
      { $set: update },
      { new: true },
    ).exec();

    if (job) {
      await onJobSettled(job);
      return;
    }

    /* Already settled by a polling refresh — still record what it cost. */
    if (await ImageJobModel.exists({ taskId: task.task_id })) {
      if (task.usage) await ImageJobModel.updateOne({ taskId: task.task_id }, { $set: { usage: task.usage } }).exec();
      return;
    }
    await sleep(1500);
  }

  logger.warn({ taskId: task.task_id }, 'Finished image task has no job record');
});

import { EmbroideryAssetModel } from '@models/embroideryasset';
import { OptionModel } from '@models/option';
import { OptionGroupModel } from '@models/optiongroup';
import { ApiError } from '@utils/apiError';
import { syncStudioPairing } from './embroideryAssets';

/**
 * Links Embroidery options to AI Studio embroidery (AI Studio › Show in the
 * designer). Customer previews come from `colourRender.ts` (`/designs/recolour`),
 * which reads the linked collection's sheet and pieces.
 */

async function groupCodeOf(optionId: string) {
  const option = await OptionModel.findById(optionId).exec();
  if (!option) return null;
  const group = await OptionGroupModel.findById(option.groupId).exec();
  return group?.code ?? null;
}

/** Links an Embroidery option to the approved asset collection it draws. */
export async function setEmbroideryCollection(optionId: string, collectionId: string | null) {
  if ((await groupCodeOf(optionId)) !== 'embroidery') {
    throw ApiError.badRequest('That is not an Embroidery option');
  }

  if (collectionId) {
    const approved = await EmbroideryAssetModel.countDocuments({ collectionId, isApproved: true });
    if (approved === 0) {
      throw ApiError.badRequest('That collection has no approved pieces yet — approve some first');
    }
  }

  const option = await OptionModel.findByIdAndUpdate(
    optionId,
    collectionId ? { $set: { assetCollectionId: collectionId } } : { $unset: { assetCollectionId: 1 } },
    { new: true },
  ).exec();

  if (!option) throw ApiError.notFound('Option not found');
  /* What the embroidery goes with becomes the option's pairing (cleared on unlink). */
  await syncStudioPairing(optionId, collectionId);
  return OptionModel.findById(optionId).exec();
}

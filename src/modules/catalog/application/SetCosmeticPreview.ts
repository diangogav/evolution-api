import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import type { CatalogChangeNotifier } from "../domain/CatalogChangeNotifier";
import type { CosmeticAssetStorage } from "../domain/CosmeticAssetStorage";
import { assertPreviewImage, COSMETIC_PREVIEW, takesPreview } from "../domain/CosmeticPreview";
import type { CosmeticRepository } from "../domain/CosmeticRepository";
import type { PublishedCosmeticDto } from "./PublishCosmetic";

export interface SetCosmeticPreviewInput {
	readonly cosmeticId: string;
	readonly bytes: Uint8Array;
}

/**
 * Gives a published cosmetic its preview, or replaces the one it has. It exists for the
 * types the client draws from data alone, which were published before they could carry
 * a picture: without one they have nothing to show where a cosmetic appears as one piece.
 */
export class SetCosmeticPreview {
	constructor(
		private readonly cosmetics: CosmeticRepository,
		private readonly storage: CosmeticAssetStorage,
		private readonly catalogChange?: CatalogChangeNotifier,
	) {}

	async run(input: SetCosmeticPreviewInput): Promise<PublishedCosmeticDto> {
		const cosmetic = await this.cosmetics.findById(input.cosmeticId);
		if (!cosmetic) throw new NotFoundError("Cosmetic not found");
		if (!takesPreview(cosmetic.type)) {
			throw new InvalidArgumentError(
				`A ${cosmetic.type} cosmetic is shown with its own image and takes no ${COSMETIC_PREVIEW}`,
			);
		}
		assertPreviewImage(input.bytes);

		// The object goes first: a recorded file that is missing would break the cosmetic
		// for clients, while an uploaded file that is not recorded yet is only unused.
		await this.storage.put({
			key: `${cosmetic.assetRef}${COSMETIC_PREVIEW}`,
			bytes: input.bytes,
			contentType: "image/jpeg",
		});
		const updated = cosmetic.withAssetFile(COSMETIC_PREVIEW);
		if (updated !== cosmetic) await this.cosmetics.save(updated);

		void this.catalogChange?.catalogChanged().catch(() => undefined);

		return {
			id: updated.id,
			type: updated.type,
			tier: updated.tier,
			assetRef: updated.assetRef,
			displayName: updated.displayName,
			active: updated.active,
			assetFiles: updated.assetFiles ?? [],
			essencePrice: updated.essencePrice,
		};
	}
}

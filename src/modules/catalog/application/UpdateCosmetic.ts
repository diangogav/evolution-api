import { NotFoundError } from "../../../shared/errors/NotFoundError";
import type { CatalogChangeNotifier } from "../domain/CatalogChangeNotifier";
import type { CosmeticAssetStorage } from "../domain/CosmeticAssetStorage";
import { assertCosmeticFiles, type CosmeticFile } from "../domain/CosmeticFiles";
import type { CosmeticRepository } from "../domain/CosmeticRepository";
import type { CosmeticTier } from "../domain/CosmeticTier";
import { type PublishedCosmeticDto, publishedCosmeticDto } from "./PublishCosmetic";
import { uploadCosmeticFiles } from "./uploadCosmeticFiles";

export interface UpdateCosmeticInput {
	readonly cosmeticId: string;
	readonly tier: CosmeticTier;
	readonly displayName: string;
	/** Price in essence in the shop; omitted takes the cosmetic out of the shop. */
	readonly essencePrice?: number;
	/** New files for the cosmetic's folder; empty keeps the ones it has. */
	readonly files: readonly CosmeticFile[];
}

/**
 * Changes a published cosmetic: its name, tier and price, and optionally its files. The
 * request states the whole cosmetic, so sending it twice leaves the same result. When
 * files are sent they replace the folder's: the ones no longer named are removed.
 */
export class UpdateCosmetic {
	constructor(
		private readonly cosmetics: CosmeticRepository,
		private readonly storage: CosmeticAssetStorage,
		private readonly catalogChange?: CatalogChangeNotifier,
	) {}

	async run(input: UpdateCosmeticInput): Promise<PublishedCosmeticDto> {
		const cosmetic = await this.cosmetics.findById(input.cosmeticId);
		if (!cosmetic) throw new NotFoundError("Cosmetic not found");

		const replacing = input.files.length > 0;
		const names = replacing
			? assertCosmeticFiles(cosmetic.type, cosmetic.assetRef, input.files)
			: cosmetic.assetFiles;
		// Every check runs before storage is touched: a rejected price or tier changes nothing.
		const updated = cosmetic.changed({
			tier: input.tier,
			displayName: input.displayName,
			essencePrice: input.essencePrice ?? null,
			assetFiles: names,
		});

		// Uploads overwrite objects in place, so a failure here cannot be undone; the record
		// still names files that exist, which keeps the cosmetic usable either way.
		if (replacing) await uploadCosmeticFiles(this.storage, cosmetic.assetRef, input.files, []);
		await this.cosmetics.save(updated);

		if (replacing && cosmetic.assetFiles && names) {
			const dropped = cosmetic.assetFiles.filter((name) => !names.includes(name));
			await Promise.allSettled(
				dropped.map((name) => this.storage.delete(`${cosmetic.assetRef}${name}`)),
			);
		}

		void this.catalogChange?.catalogChanged().catch(() => undefined);

		return publishedCosmeticDto(updated);
	}
}

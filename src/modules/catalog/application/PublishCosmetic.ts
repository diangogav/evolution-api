import { ConflictError } from "../../../shared/errors/ConflictError";
import type { CatalogChangeNotifier } from "../domain/CatalogChangeNotifier";
import { Cosmetic } from "../domain/Cosmetic";
import type { CosmeticAssetStorage } from "../domain/CosmeticAssetStorage";
import { assertAssetRef, assertCosmeticFiles, type CosmeticFile } from "../domain/CosmeticFiles";
import type { CosmeticRepository } from "../domain/CosmeticRepository";
import type { CosmeticTier } from "../domain/CosmeticTier";
import type { CosmeticType } from "../domain/CosmeticType";
import { uploadCosmeticFiles } from "./uploadCosmeticFiles";

export type PublishCosmeticFile = CosmeticFile;

export interface PublishCosmeticInput {
	readonly type: CosmeticType;
	readonly tier: CosmeticTier;
	readonly assetRef: string;
	readonly displayName: string;
	/** Price in essence in the shop; omitted means not for sale. */
	readonly essencePrice?: number;
	readonly files: readonly PublishCosmeticFile[];
}

export interface PublishedCosmeticDto {
	readonly id: string;
	readonly type: CosmeticType;
	readonly tier: CosmeticTier;
	readonly assetRef: string;
	readonly displayName: string;
	readonly active: boolean;
	readonly assetFiles: readonly string[];
	readonly essencePrice: number | null;
}

export function publishedCosmeticDto(cosmetic: Cosmetic): PublishedCosmeticDto {
	return {
		id: cosmetic.id,
		type: cosmetic.type,
		tier: cosmetic.tier,
		assetRef: cosmetic.assetRef,
		displayName: cosmetic.displayName,
		active: cosmetic.active,
		assetFiles: cosmetic.assetFiles ?? [],
		essencePrice: cosmetic.essencePrice,
	};
}

export class PublishCosmetic {
	constructor(
		private readonly cosmetics: CosmeticRepository,
		private readonly storage: CosmeticAssetStorage,
		private readonly catalogChange?: CatalogChangeNotifier,
	) {}

	async run(input: PublishCosmeticInput): Promise<PublishedCosmeticDto> {
		assertAssetRef(input.type, input.assetRef);
		const names = assertCosmeticFiles(input.type, input.assetRef, input.files);

		const duplicate = (await this.cosmetics.findAll()).find(
			(cosmetic) => cosmetic.assetRef === input.assetRef,
		);
		if (duplicate) {
			throw new ConflictError(`A cosmetic already uses assetRef "${input.assetRef}"`);
		}

		const cosmetic = Cosmetic.create({
			id: crypto.randomUUID(),
			type: input.type,
			tier: input.tier,
			assetRef: input.assetRef,
			displayName: input.displayName,
			assetFiles: names,
			essencePrice: input.essencePrice,
		});

		const uploaded: string[] = [];
		try {
			await uploadCosmeticFiles(this.storage, input.assetRef, input.files, uploaded);
			await this.cosmetics.save(cosmetic);
		} catch (error) {
			await Promise.allSettled(uploaded.map((key) => this.storage.delete(key)));
			throw error;
		}

		// The public index refresh waits for the CDN to pick it up before new
		// URLs go public; the admin request does not wait for that, and the
		// refresh logs its own failures.
		void this.catalogChange?.catalogChanged().catch(() => undefined);

		return publishedCosmeticDto(cosmetic);
	}
}

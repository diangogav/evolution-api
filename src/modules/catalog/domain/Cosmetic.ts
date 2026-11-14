import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { CosmeticTier } from "./CosmeticTier";
import { CosmeticType } from "./CosmeticType";

export const MAX_ESSENCE_PRICE = 1_000_000;

export class Cosmetic {
	private constructor(
		public readonly id: string,
		public readonly type: CosmeticType,
		public readonly tier: CosmeticTier,
		public readonly assetRef: string,
		public readonly displayName: string,
		public readonly active: boolean,
		public readonly assetFiles: readonly string[] | null = null,
		// Price in essence in the shop; null means it is not for sale.
		public readonly essencePrice: number | null = null,
	) {}

	static create({
		id,
		type,
		tier,
		assetRef,
		displayName,
		assetFiles,
		essencePrice,
	}: {
		id: string;
		type: CosmeticType;
		tier: CosmeticTier;
		assetRef: string;
		displayName: string;
		assetFiles?: readonly string[];
		essencePrice?: number | null;
	}): Cosmetic {
		if (!assetRef.trim()) {
			throw new InvalidArgumentError("assetRef cannot be empty");
		}
		// assetRef is a folder prefix in object storage — its files (render.jpg for
		// sleeves/avatars, background.webp for playmat stages) live under it,
		// so it must end with "/".
		if (!assetRef.endsWith("/")) {
			throw new InvalidArgumentError("assetRef must be a folder prefix ending with '/'");
		}
		if (!displayName.trim()) {
			throw new InvalidArgumentError("displayName cannot be empty");
		}
		const price = essencePrice ?? null;
		if (price !== null) {
			if (!Number.isInteger(price) || price < 1 || price > MAX_ESSENCE_PRICE) {
				throw new InvalidArgumentError(
					`essencePrice must be a whole number between 1 and ${MAX_ESSENCE_PRICE}`,
				);
			}
			// Everyone already holds these tiers, so a price would list something nobody can buy.
			if (tier === CosmeticTier.STANDARD || tier === CosmeticTier.REGISTERED) {
				throw new InvalidArgumentError(`A ${tier} cosmetic cannot have a price`);
			}
		}
		return new Cosmetic(id, type, tier, assetRef, displayName, true, assetFiles ?? null, price);
	}

	static from(data: {
		id: string;
		type: CosmeticType;
		tier: CosmeticTier;
		assetRef: string;
		displayName: string;
		active: boolean;
		assetFiles?: readonly string[] | null;
		essencePrice?: number | null;
	}): Cosmetic {
		return new Cosmetic(
			data.id,
			data.type,
			data.tier,
			data.assetRef,
			data.displayName,
			data.active,
			data.assetFiles ?? null,
			data.essencePrice ?? null,
		);
	}

	toPrimitives(): {
		id: string;
		type: CosmeticType;
		tier: CosmeticTier;
		assetRef: string;
		displayName: string;
		active: boolean;
		assetFiles: readonly string[] | null;
		essencePrice: number | null;
	} {
		return {
			id: this.id,
			type: this.type,
			tier: this.tier,
			assetRef: this.assetRef,
			displayName: this.displayName,
			active: this.active,
			assetFiles: this.assetFiles,
			essencePrice: this.essencePrice,
		};
	}
}

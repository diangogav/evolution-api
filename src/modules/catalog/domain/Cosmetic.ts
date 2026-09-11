import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { CosmeticTier } from "./CosmeticTier";
import { CosmeticType } from "./CosmeticType";

export class Cosmetic {
	private constructor(
		public readonly id: string,
		public readonly type: CosmeticType,
		public readonly tier: CosmeticTier,
		public readonly assetRef: string,
		public readonly displayName: string,
		public readonly active: boolean,
		public readonly assetFiles: readonly string[] | null = null,
	) {}

	static create({
		id,
		type,
		tier,
		assetRef,
		displayName,
		assetFiles,
	}: {
		id: string;
		type: CosmeticType;
		tier: CosmeticTier;
		assetRef: string;
		displayName: string;
		assetFiles?: readonly string[];
	}): Cosmetic {
		if (!assetRef.trim()) {
			throw new InvalidArgumentError("assetRef cannot be empty");
		}
		// assetRef is a folder prefix in object storage — its files (render.jpg for
		// sleeves/avatars, surface/background/theme.json for stages) live under it,
		// so it must end with "/".
		if (!assetRef.endsWith("/")) {
			throw new InvalidArgumentError("assetRef must be a folder prefix ending with '/'");
		}
		if (!displayName.trim()) {
			throw new InvalidArgumentError("displayName cannot be empty");
		}
		return new Cosmetic(id, type, tier, assetRef, displayName, true, assetFiles ?? null);
	}

	static from(data: {
		id: string;
		type: CosmeticType;
		tier: CosmeticTier;
		assetRef: string;
		displayName: string;
		active: boolean;
		assetFiles?: readonly string[] | null;
	}): Cosmetic {
		return new Cosmetic(
			data.id,
			data.type,
			data.tier,
			data.assetRef,
			data.displayName,
			data.active,
			data.assetFiles ?? null,
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
	} {
		return {
			id: this.id,
			type: this.type,
			tier: this.tier,
			assetRef: this.assetRef,
			displayName: this.displayName,
			active: this.active,
			assetFiles: this.assetFiles,
		};
	}
}

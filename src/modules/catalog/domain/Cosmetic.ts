import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import type { CompanionAnimationDescriptor } from "./CompanionAnimation";
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
		public readonly animation?: CompanionAnimationDescriptor,
		public readonly assetFiles: readonly string[] | null = null,
	) {}

	static create({
		id,
		type,
		tier,
		assetRef,
		displayName,
		animation,
		assetFiles,
	}: {
		id: string;
		type: CosmeticType;
		tier: CosmeticTier;
		assetRef: string;
		displayName: string;
		animation?: CompanionAnimationDescriptor;
		assetFiles?: readonly string[];
	}): Cosmetic {
		if (!assetRef.trim()) {
			throw new InvalidArgumentError("assetRef cannot be empty");
		}
		// assetRef is a folder prefix in object storage — its files (render/preview,
		// gltf/bin/texture) live under it, so it must end with "/".
		if (!assetRef.endsWith("/")) {
			throw new InvalidArgumentError("assetRef must be a folder prefix ending with '/'");
		}
		if (!displayName.trim()) {
			throw new InvalidArgumentError("displayName cannot be empty");
		}
		// The animation descriptor is exclusive to COMPANION assets — it has no meaning
		// for any other type, so carrying it elsewhere is a programming error.
		if (animation !== undefined && type !== CosmeticType.COMPANION) {
			throw new InvalidArgumentError("animation is only allowed for COMPANION cosmetics");
		}

		return new Cosmetic(id, type, tier, assetRef, displayName, true, animation, assetFiles ?? null);
	}

	static from(data: {
		id: string;
		type: CosmeticType;
		tier: CosmeticTier;
		assetRef: string;
		displayName: string;
		active: boolean;
		animation?: CompanionAnimationDescriptor;
		assetFiles?: readonly string[] | null;
	}): Cosmetic {
		return new Cosmetic(
			data.id,
			data.type,
			data.tier,
			data.assetRef,
			data.displayName,
			data.active,
			data.animation,
			data.assetFiles ?? null,
		);
	}

	configureAnimation(animation?: CompanionAnimationDescriptor): Cosmetic {
		if (this.type !== CosmeticType.COMPANION) {
			throw new InvalidArgumentError("animation is only allowed for COMPANION cosmetics");
		}

		return new Cosmetic(
			this.id,
			this.type,
			this.tier,
			this.assetRef,
			this.displayName,
			this.active,
			animation,
			this.assetFiles,
		);
	}

	replaceAssetFile(
		currentFile: string,
		replacementFile: string,
		animation: CompanionAnimationDescriptor | undefined = this.animation,
	): Cosmetic {
		if (!this.assetFiles?.includes(currentFile)) {
			throw new InvalidArgumentError(
				`Asset file "${currentFile}" does not belong to this cosmetic`,
			);
		}
		if (!replacementFile.trim()) {
			throw new InvalidArgumentError("replacement asset file cannot be empty");
		}

		return new Cosmetic(
			this.id,
			this.type,
			this.tier,
			this.assetRef,
			this.displayName,
			this.active,
			animation,
			this.assetFiles.map((file) => (file === currentFile ? replacementFile : file)),
		);
	}

	toPrimitives(): {
		id: string;
		type: CosmeticType;
		tier: CosmeticTier;
		assetRef: string;
		displayName: string;
		active: boolean;
		animation?: CompanionAnimationDescriptor;
		assetFiles: readonly string[] | null;
	} {
		return {
			id: this.id,
			type: this.type,
			tier: this.tier,
			assetRef: this.assetRef,
			displayName: this.displayName,
			active: this.active,
			animation: this.animation,
			assetFiles: this.assetFiles,
		};
	}
}

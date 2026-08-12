import type { CosmeticAssetStorage } from "../../assets/domain/CosmeticAssetStorage";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import type { CompanionAnimationDescriptor } from "../domain/CompanionAnimation";
import type { CosmeticRepository } from "../domain/CosmeticRepository";
import { CosmeticType } from "../domain/CosmeticType";

const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_MODEL_BYTES = 12 * 1024 * 1024;

export interface ReplaceCompanionModelInput {
	readonly cosmeticId: string;
	readonly file: {
		readonly name: string;
		readonly bytes: Uint8Array;
	};
	readonly animation?: CompanionAnimationDescriptor;
}

export interface ReplacedCompanionModelDto {
	readonly cosmeticId: string;
	readonly assetFiles: readonly string[];
	readonly modelFile: string;
	readonly animation?: CompanionAnimationDescriptor;
}

function revisionFileName(fileName: string, revision: string): string {
	const extensionIndex = fileName.lastIndexOf(".");
	const stem = fileName.slice(0, extensionIndex);
	return `${stem}.revision-${revision}${fileName.slice(extensionIndex)}`;
}

/** Safely swaps the primary self-contained GLB while preserving the catalog identity. */
export class ReplaceCompanionModel {
	constructor(
		private readonly cosmetics: CosmeticRepository,
		private readonly storage: CosmeticAssetStorage,
		private readonly createRevision: () => string = () => crypto.randomUUID().slice(0, 8),
	) {}

	async run(input: ReplaceCompanionModelInput): Promise<ReplacedCompanionModelDto> {
		const cosmetic = await this.cosmetics.findById(input.cosmeticId);
		if (!cosmetic) throw new NotFoundError(`Cosmetic "${input.cosmeticId}" not found`);
		if (cosmetic.type !== CosmeticType.COMPANION) {
			throw new InvalidArgumentError("Only companion models can be replaced through this endpoint");
		}

		const { name, bytes } = input.file;
		if (!SAFE_FILE_NAME.test(name) || name.length > 160) {
			throw new InvalidArgumentError(`Unsafe asset filename "${name}"`);
		}
		if (!name.toLowerCase().endsWith(".glb")) {
			throw new InvalidArgumentError("A companion replacement must be a .glb file");
		}
		if (bytes.byteLength === 0) {
			throw new InvalidArgumentError("The replacement GLB is empty");
		}
		if (bytes.byteLength > MAX_MODEL_BYTES) {
			throw new InvalidArgumentError("The replacement GLB exceeds the 12 MB upload limit");
		}

		const rigFile = cosmetic.animation?.rigFile?.toLowerCase();
		const currentModel = cosmetic.assetFiles?.find(
			(file) => file.toLowerCase().endsWith(".glb") && file.toLowerCase() !== rigFile,
		);
		if (!currentModel) {
			throw new InvalidArgumentError("This companion has no replaceable primary GLB");
		}

		const nextModel = revisionFileName(name, this.createRevision());
		const nextKey = `${cosmetic.assetRef}${nextModel}`;
		const currentKey = `${cosmetic.assetRef}${currentModel}`;
		await this.storage.put({ key: nextKey, bytes, contentType: "model/gltf-binary" });

		try {
			const replaced = cosmetic.replaceAssetFile(
				currentModel,
				nextModel,
				input.animation ?? cosmetic.animation,
			);
			await this.cosmetics.save(replaced);
			await this.storage.delete(currentKey).catch(() => undefined);

			return {
				cosmeticId: replaced.id,
				assetFiles: replaced.assetFiles ?? [],
				modelFile: nextModel,
				...(replaced.animation ? { animation: replaced.animation } : {}),
			};
		} catch (error) {
			await this.storage.delete(nextKey).catch(() => undefined);
			throw error;
		}
	}
}

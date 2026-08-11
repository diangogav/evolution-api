import type { CosmeticAssetStorage } from "../../assets/domain/CosmeticAssetStorage";
import { ConflictError } from "../../../shared/errors/ConflictError";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import type { CompanionAnimationDescriptor } from "../domain/CompanionAnimation";
import { Cosmetic } from "../domain/Cosmetic";
import type { CosmeticRepository } from "../domain/CosmeticRepository";
import { CosmeticTier } from "../domain/CosmeticTier";
import { CosmeticType } from "../domain/CosmeticType";

const MAX_FILES = 8;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const PREFIX_BY_TYPE: Partial<Record<CosmeticType, string>> = {
	[CosmeticType.SLEEVE]: "sleeves",
	[CosmeticType.PLAYMAT]: "playmats",
	[CosmeticType.AVATAR]: "avatars",
	[CosmeticType.COMPANION]: "companions",
};

export interface PublishCosmeticFile {
	readonly name: string;
	readonly bytes: Uint8Array;
}

export interface PublishCosmeticInput {
	readonly type: CosmeticType;
	readonly tier: CosmeticTier;
	readonly assetRef: string;
	readonly displayName: string;
	readonly files: readonly PublishCosmeticFile[];
	readonly animation?: CompanionAnimationDescriptor;
}

export interface PublishedCosmeticDto {
	readonly id: string;
	readonly type: CosmeticType;
	readonly tier: CosmeticTier;
	readonly assetRef: string;
	readonly displayName: string;
	readonly active: boolean;
	readonly assetFiles: readonly string[];
}

function contentTypeFor(fileName: string): string {
	const extension = fileName.split(".").pop()?.toLowerCase();
	switch (extension) {
		case "glb":
			return "model/gltf-binary";
		case "gltf":
			return "model/gltf+json";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "webp":
			return "image/webp";
		default:
			return "application/octet-stream";
	}
}

function assertAssetRef(type: CosmeticType, assetRef: string): void {
	const prefix = PREFIX_BY_TYPE[type];
	if (!prefix) {
		throw new InvalidArgumentError(`Cosmetic type ${type} is not supported by the backoffice`);
	}

	const match = assetRef.match(/^([^/]+)\/([^/]+)\/$/);
	if (!match || match[1] !== prefix || !SAFE_SLUG.test(match[2] ?? "")) {
		throw new InvalidArgumentError(`assetRef for ${type} must match ${prefix}/kebab-case-slug/`);
	}
}

function assertRequiredFiles(type: CosmeticType, names: ReadonlySet<string>): void {
	const lower = new Set(Array.from(names, (name) => name.toLowerCase()));
	if ((type === CosmeticType.SLEEVE || type === CosmeticType.AVATAR) && !lower.has("render.jpg")) {
		throw new InvalidArgumentError(`${type} requires render.jpg`);
	}

	if (
		type === CosmeticType.PLAYMAT &&
		![...lower].some((name) => name.endsWith(".gltf") || name.endsWith(".glb"))
	) {
		throw new InvalidArgumentError("PLAYMAT requires a .gltf or .glb entry file");
	}

	if (type === CosmeticType.COMPANION && ![...lower].some((name) => name.endsWith(".glb"))) {
		throw new InvalidArgumentError("COMPANION requires at least one .glb file");
	}
}

export class PublishCosmetic {
	constructor(
		private readonly cosmetics: CosmeticRepository,
		private readonly storage: CosmeticAssetStorage,
	) {}

	async run(input: PublishCosmeticInput): Promise<PublishedCosmeticDto> {
		assertAssetRef(input.type, input.assetRef);

		if (input.files.length === 0 || input.files.length > MAX_FILES) {
			throw new InvalidArgumentError(`A cosmetic requires between 1 and ${MAX_FILES} files`);
		}

		const names = new Set<string>();
		let totalBytes = 0;
		for (const file of input.files) {
			if (!SAFE_FILE_NAME.test(file.name)) {
				throw new InvalidArgumentError(`Unsafe asset filename "${file.name}"`);
			}
			if (names.has(file.name)) {
				throw new InvalidArgumentError(`Duplicate asset filename "${file.name}"`);
			}
			if (file.bytes.byteLength === 0) {
				throw new InvalidArgumentError(`Asset file "${file.name}" is empty`);
			}
			names.add(file.name);
			totalBytes += file.bytes.byteLength;
		}

		if (totalBytes > MAX_TOTAL_BYTES) {
			throw new InvalidArgumentError("Cosmetic assets exceed the 25 MB upload limit");
		}
		assertRequiredFiles(input.type, names);

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
			animation: input.animation,
			assetFiles: [...names],
		});

		const uploaded: string[] = [];
		try {
			for (const file of input.files) {
				const key = `${input.assetRef}${file.name}`;
				await this.storage.put({
					key,
					bytes: file.bytes,
					contentType: contentTypeFor(file.name),
				});
				uploaded.push(key);
			}
			await this.cosmetics.save(cosmetic);
		} catch (error) {
			await Promise.allSettled(uploaded.map((key) => this.storage.delete(key)));
			throw error;
		}

		return {
			id: cosmetic.id,
			type: cosmetic.type,
			tier: cosmetic.tier,
			assetRef: cosmetic.assetRef,
			displayName: cosmetic.displayName,
			active: cosmetic.active,
			assetFiles: cosmetic.assetFiles ?? [],
		};
	}
}

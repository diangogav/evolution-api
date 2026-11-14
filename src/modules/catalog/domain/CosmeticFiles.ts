import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { AMBIENCE_MANIFEST, parseAmbience } from "./Ambience";
import { assertCardFrameKitFiles, isSafeKitPath, MAX_CARD_FRAME_FILES } from "./CardFrameKit";
import { assertPreviewImage, COSMETIC_PREVIEW, takesPreview } from "./CosmeticPreview";
import { CosmeticType } from "./CosmeticType";
import { assertEmotePackFiles, MAX_EMOTE_PACK_FILES } from "./EmotePack";
import { parseZonePlate, ZONE_PLATE_MANIFEST } from "./ZonePlate";

/** One file of a cosmetic as an administrator uploads it. */
export interface CosmeticFile {
	readonly name: string;
	readonly bytes: Uint8Array;
}

const MAX_FILES = 8;
const MAX_FILES_BY_TYPE: Partial<Record<CosmeticType, number>> = {
	// The pack's own files plus its preview.
	[CosmeticType.EMOTE_PACK]: MAX_EMOTE_PACK_FILES + 1,
	[CosmeticType.CARD_FRAME]: MAX_CARD_FRAME_FILES,
};
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STAGE_FILE = /^background\.(?:webp|png|jpe?g)$/;

const PREFIX_BY_TYPE: Partial<Record<CosmeticType, string>> = {
	[CosmeticType.SLEEVE]: "sleeves",
	[CosmeticType.PLAYMAT]: "playmats",
	[CosmeticType.AVATAR]: "avatars",
	[CosmeticType.LANE]: "lanes",
	[CosmeticType.AMBIENCE]: "ambience",
	[CosmeticType.EMOTE_PACK]: "emote-packs",
	[CosmeticType.CARD_FRAME]: "frames",
};

export function contentTypeFor(fileName: string): string {
	const extension = fileName.split(".").pop()?.toLowerCase();
	switch (extension) {
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "webp":
			return "image/webp";
		case "json":
			return "application/json";
		default:
			return "application/octet-stream";
	}
}

export function assertAssetRef(type: CosmeticType, assetRef: string): void {
	const prefix = PREFIX_BY_TYPE[type];
	if (!prefix) {
		throw new InvalidArgumentError(`Cosmetic type ${type} is not supported by the backoffice`);
	}

	const match = assetRef.match(/^([^/]+)\/([^/]+)\/$/);
	if (!match || match[1] !== prefix || !SAFE_SLUG.test(match[2] ?? "")) {
		throw new InvalidArgumentError(`assetRef for ${type} must match ${prefix}/kebab-case-slug/`);
	}
}

// Only a card frame kit is a folder tree; every other type stays a flat list
// of files so its keys keep the shape the client already fetches.
function isSafeAssetName(type: CosmeticType, name: string): boolean {
	return type === CosmeticType.CARD_FRAME ? isSafeKitPath(name) : SAFE_FILE_NAME.test(name);
}

function slugOf(assetRef: string): string {
	return assetRef.split("/")[1] ?? "";
}

function assertRequiredFiles(type: CosmeticType, names: ReadonlySet<string>): void {
	const lower = new Set(Array.from(names, (name) => name.toLowerCase()));
	if ((type === CosmeticType.SLEEVE || type === CosmeticType.AVATAR) && !lower.has("render.jpg")) {
		throw new InvalidArgumentError(`${type} requires render.jpg`);
	}

	// A playmat is one low-poly stage: background.<image> is the backdrop the
	// board paints behind the zones, and the only file the client reads.
	if (type === CosmeticType.PLAYMAT && ![...lower].some((name) => STAGE_FILE.test(name))) {
		throw new InvalidArgumentError(
			"PLAYMAT requires background.webp, background.png or background.jpg",
		);
	}

	// A lane is a zone plate the board draws procedurally from plate.json alone;
	// any extra file would be served but never used. The name is exact: the
	// client fetches the lowercase key from the signed manifest.
	if (type === CosmeticType.LANE && (names.size !== 1 || !names.has(ZONE_PLATE_MANIFEST))) {
		throw new InvalidArgumentError(`LANE requires exactly one file: ${ZONE_PLATE_MANIFEST}`);
	}

	// Ambience is drawn from ambience.json alone, fetched by its exact key.
	if (type === CosmeticType.AMBIENCE && (names.size !== 1 || !names.has(AMBIENCE_MANIFEST))) {
		throw new InvalidArgumentError(`AMBIENCE requires exactly one file: ${AMBIENCE_MANIFEST}`);
	}
}

/**
 * Checks the files of a cosmetic against the rules of its type and returns their names.
 * Publishing a new cosmetic and replacing the files of an existing one accept exactly
 * the same uploads.
 */
export function assertCosmeticFiles(
	type: CosmeticType,
	assetRef: string,
	files: readonly CosmeticFile[],
): string[] {
	const maxFiles = MAX_FILES_BY_TYPE[type] ?? MAX_FILES;
	if (files.length === 0 || files.length > maxFiles) {
		throw new InvalidArgumentError(`A cosmetic requires between 1 and ${maxFiles} files`);
	}

	const names = new Set<string>();
	let totalBytes = 0;
	for (const file of files) {
		if (!isSafeAssetName(type, file.name)) {
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
	// A preview travels with the cosmetic but is not one of the files it is drawn from,
	// so the type's own rules are checked against the rest.
	const preview = takesPreview(type)
		? files.find((file) => file.name === COSMETIC_PREVIEW)
		: undefined;
	if (preview) assertPreviewImage(preview.bytes);
	const ownFiles = files.filter((file) => file !== preview);
	const ownNames = new Set(ownFiles.map((file) => file.name));

	assertRequiredFiles(type, ownNames);
	if (type === CosmeticType.EMOTE_PACK) {
		assertEmotePackFiles(slugOf(assetRef), ownFiles);
	}
	if (type === CosmeticType.CARD_FRAME) {
		assertCardFrameKitFiles(files);
	}
	if (type === CosmeticType.LANE) {
		parseZonePlate(ownFiles[0].bytes);
	}
	if (type === CosmeticType.AMBIENCE) {
		parseAmbience(ownFiles[0].bytes);
	}
	return [...names];
}

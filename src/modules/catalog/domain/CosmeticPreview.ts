import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { CosmeticType } from "./CosmeticType";

/** The picture a cosmetic is shown with wherever it appears as one piece, such as a shop card. */
export const COSMETIC_PREVIEW = "preview.jpg";
export const MAX_PREVIEW_BYTES = 512 * 1024;

// These types are drawn by the client from data alone (colours, motes, animations), so
// they have no image of their own to show; a preview is the only one they can carry.
const PREVIEW_ONLY_TYPES: readonly CosmeticType[] = [
	CosmeticType.EMOTE_PACK,
	CosmeticType.LANE,
	CosmeticType.AMBIENCE,
];

/** Whether a cosmetic of this type may carry a preview next to the files it is drawn from. */
export function takesPreview(type: CosmeticType): boolean {
	return PREVIEW_ONLY_TYPES.includes(type);
}

export function assertPreviewImage(bytes: Uint8Array): void {
	if (bytes.byteLength === 0) {
		throw new InvalidArgumentError(`${COSMETIC_PREVIEW} is empty`);
	}
	if (bytes.byteLength > MAX_PREVIEW_BYTES) {
		throw new InvalidArgumentError(`${COSMETIC_PREVIEW} exceeds ${MAX_PREVIEW_BYTES / 1024} KB`);
	}
	// Every JPEG starts with the SOI marker followed by another marker.
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
		throw new InvalidArgumentError(`${COSMETIC_PREVIEW} is not a JPEG image`);
	}
}

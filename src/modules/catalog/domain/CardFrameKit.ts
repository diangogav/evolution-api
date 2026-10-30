import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";

export const CARD_FRAME_LAYOUT = "layout.json";
export const CARD_FRAME_PREVIEW = "preview.webp";
export const MAX_CARD_FRAME_FILES = 200;

const MAX_PATH_SEGMENTS = 3;
const FOLDER_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
const FILE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LAYER_FILE = /\.png$/;

export interface CardFrameArtWindow {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** The part of a kit's layout.json the API relies on; the client reads the rest. */
export interface CardFrameLayout {
	readonly canvas: readonly [number, number];
	readonly artWindow: CardFrameArtWindow;
}

export interface CardFrameKitFile {
	readonly name: string;
	readonly bytes: Uint8Array;
}

function fail(message: string): never {
	throw new InvalidArgumentError(`${CARD_FRAME_LAYOUT} ${message}`);
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function readCanvas(value: unknown): [number, number] {
	if (
		!Array.isArray(value) ||
		value.length !== 2 ||
		!isPositiveInteger(value[0]) ||
		!isPositiveInteger(value[1])
	) {
		fail("canvas must be two positive integers");
	}
	return [value[0], value[1]];
}

function readArtWindow(value: unknown): CardFrameArtWindow {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		fail("artWindow must be an object with numeric x, y, w, h");
	}
	const { x, y, w, h } = value as Record<string, unknown>;
	if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)) {
		fail("artWindow must be an object with numeric x, y, w, h");
	}
	if (w <= 0 || h <= 0) {
		fail("artWindow w and h must be greater than 0");
	}
	return { x, y, w, h };
}

/**
 * Parses the fields of a card frame layout the API validates. Unknown keys are
 * ignored so later kits can add fields without breaking older uploads.
 */
export function parseCardFrameLayout(source: Uint8Array | string): CardFrameLayout {
	const text = typeof source === "string" ? source : new TextDecoder().decode(source);
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new InvalidArgumentError(`${CARD_FRAME_LAYOUT} is not valid JSON`);
	}
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		throw new InvalidArgumentError(`${CARD_FRAME_LAYOUT} must be a JSON object`);
	}

	const root = raw as Record<string, unknown>;
	return { canvas: readCanvas(root.canvas), artWindow: readArtWindow(root.artWindow) };
}

/**
 * A kit path is relative to the kit folder: lowercase folders and a safe file
 * name, with no empty, dot or traversal segment, so it can only ever name a key
 * under the cosmetic's own assetRef.
 */
export function isSafeKitPath(path: string): boolean {
	const segments = path.split("/");
	if (segments.length > MAX_PATH_SEGMENTS) return false;
	const fileName = segments.pop() ?? "";
	return FILE_SEGMENT.test(fileName) && segments.every((folder) => FOLDER_SEGMENT.test(folder));
}

/** Checks a kit carries its layout and preview, and that every other file is a layer. */
export function assertCardFrameKitFiles(files: readonly CardFrameKitFile[]): void {
	const layout = files.find((file) => file.name === CARD_FRAME_LAYOUT);
	if (!layout) {
		throw new InvalidArgumentError(`CARD_FRAME requires ${CARD_FRAME_LAYOUT}`);
	}
	if (!files.some((file) => file.name === CARD_FRAME_PREVIEW)) {
		throw new InvalidArgumentError(`CARD_FRAME requires ${CARD_FRAME_PREVIEW}`);
	}
	for (const file of files) {
		if (file.name === CARD_FRAME_LAYOUT || file.name === CARD_FRAME_PREVIEW) continue;
		if (!LAYER_FILE.test(file.name)) {
			throw new InvalidArgumentError(`CARD_FRAME file "${file.name}" must be a .png layer`);
		}
	}
	parseCardFrameLayout(layout.bytes);
}

import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";

export const AMBIENCE_MANIFEST = "ambience.json";

export const MOTE_SHAPES = ["leaf", "spark", "ember", "snow", "petal", "bubble", "bat"] as const;
export type MoteShape = (typeof MOTE_SHAPES)[number];

const MANIFEST_VERSION = 1;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_MOTES = MOTE_SHAPES.length;
const MAX_COLORS = 8;

export interface AmbienceMote {
	readonly shape: MoteShape;
	readonly colors: readonly string[];
	readonly share: number;
}

/** Drifting motes and an optional light sweep the board draws over the stage. */
export interface Ambience {
	readonly motes: readonly AmbienceMote[];
	readonly sweep?: string;
}

function fail(message: string): never {
	throw new InvalidArgumentError(`${AMBIENCE_MANIFEST} ${message}`);
}

function readColor(value: unknown, field: string): string {
	if (typeof value !== "string" || !HEX_COLOR.test(value)) {
		fail(`${field} must be a #rrggbb colour, got ${JSON.stringify(value)}`);
	}
	return value;
}

function readMote(raw: unknown, index: number, seen: Set<string>): AmbienceMote {
	const path = `motes[${index}]`;
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		fail(`${path} must be an object`);
	}
	const mote = raw as Record<string, unknown>;

	const shape = MOTE_SHAPES.find((candidate) => candidate === mote.shape);
	if (!shape) {
		fail(`${path}.shape must be one of ${MOTE_SHAPES.join(", ")}`);
	}
	if (seen.has(shape)) {
		fail(`${path}.shape is a duplicate of "${shape}"`);
	}
	seen.add(shape);

	const colors = mote.colors;
	if (!Array.isArray(colors) || colors.length < 1 || colors.length > MAX_COLORS) {
		fail(`${path}.colors must hold 1 to ${MAX_COLORS} colours`);
	}

	const share = mote.share;
	if (typeof share !== "number" || !Number.isFinite(share) || share <= 0) {
		fail(`${path}.share must be a number greater than 0`);
	}

	return {
		shape,
		colors: colors.map((color, i) => readColor(color, `${path}.colors[${i}]`)),
		share,
	};
}

/**
 * Parses and validates an ambience manifest. Shares are relative weights the
 * client normalises, so they need not sum to 1. Unknown keys are ignored so the
 * client can grow the format without breaking older uploads.
 */
export function parseAmbience(source: Uint8Array | string): Ambience {
	const text = typeof source === "string" ? source : new TextDecoder().decode(source);
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		fail("is not valid JSON");
	}
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		fail("must be a JSON object");
	}

	const root = raw as Record<string, unknown>;
	if (root.version !== MANIFEST_VERSION) {
		fail(`version must be ${MANIFEST_VERSION}`);
	}

	const motes = root.motes;
	if (!Array.isArray(motes) || motes.length < 1 || motes.length > MAX_MOTES) {
		fail(`motes must hold 1 to ${MAX_MOTES} entries`);
	}
	const seen = new Set<string>();
	const parsed = motes.map((mote, index) => readMote(mote, index, seen));

	return root.sweep === undefined
		? { motes: parsed }
		: { motes: parsed, sweep: readColor(root.sweep, "sweep") };
}

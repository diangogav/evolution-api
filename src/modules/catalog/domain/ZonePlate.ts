import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";

export const ZONE_PLATE_MANIFEST = "plate.json";

const MANIFEST_VERSION = 1;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Colours the board uses to draw a zone plate procedurally. */
export interface ZonePlate {
	readonly base: string;
	readonly accent: string;
	readonly rim?: string;
}

function readColor(root: Record<string, unknown>, key: "base" | "accent" | "rim"): string {
	const value = root[key];
	if (typeof value !== "string" || !HEX_COLOR.test(value)) {
		throw new InvalidArgumentError(
			`${ZONE_PLATE_MANIFEST} ${key} must be a #rrggbb colour, got ${JSON.stringify(value)}`,
		);
	}
	return value;
}

/**
 * Parses and validates a zone plate manifest. Unknown keys are ignored so the
 * client can grow the format without breaking older uploads.
 */
export function parseZonePlate(source: Uint8Array | string): ZonePlate {
	const text = typeof source === "string" ? source : new TextDecoder().decode(source);
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new InvalidArgumentError(`${ZONE_PLATE_MANIFEST} is not valid JSON`);
	}
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		throw new InvalidArgumentError(`${ZONE_PLATE_MANIFEST} must be a JSON object`);
	}

	const root = raw as Record<string, unknown>;
	if (root.version !== MANIFEST_VERSION) {
		throw new InvalidArgumentError(`${ZONE_PLATE_MANIFEST} version must be ${MANIFEST_VERSION}`);
	}

	const plate = { base: readColor(root, "base"), accent: readColor(root, "accent") };
	return root.rim === undefined ? plate : { ...plate, rim: readColor(root, "rim") };
}

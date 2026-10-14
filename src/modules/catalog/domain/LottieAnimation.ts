import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";

export const MAX_LOTTIE_BYTES = 200 * 1024;
export const MAX_LOTTIE_SECONDS = 3;
export const MAX_LOTTIE_DEPTH = 64;

const TEXT_LAYER_TYPE = 5;
const VERSION = /^\d+(?:\.\d+)*$/;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

// Lottie keeps expressions in an `x` string next to the animated value it drives, at any
// depth, so the whole tree has to be walked. The walk is iterative and bounded so hostile
// nesting inside the size cap is rejected instead of exhausting the stack.
function scanTree(fileName: string, root: unknown): { hasExpression: boolean } {
	const pending: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }];
	for (let entry = pending.pop(); entry; entry = pending.pop()) {
		const { node, depth } = entry;
		if (typeof node !== "object" || node === null) continue;
		if (depth > MAX_LOTTIE_DEPTH) {
			throw new InvalidArgumentError(`${fileName} is nested too deeply`);
		}
		if (Array.isArray(node)) {
			for (const child of node) pending.push({ node: child, depth: depth + 1 });
			continue;
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === "x" && typeof value === "string") return { hasExpression: true };
			pending.push({ node: value, depth: depth + 1 });
		}
	}
	return { hasExpression: false };
}

function layerGroups(rootLayers: unknown[], assets: unknown[]): unknown[][] {
	const groups: unknown[][] = [rootLayers];
	for (const asset of assets) {
		if (isObject(asset) && Array.isArray(asset.layers)) groups.push(asset.layers);
	}
	return groups;
}

/**
 * Accepts only the vector subset the client renders safely with lottie-web's SVG
 * renderer: no raster or external assets, no text or fonts, no expressions, and a
 * bounded size and duration.
 */
export function assertVectorLottie(fileName: string, bytes: Uint8Array): void {
	if (bytes.byteLength > MAX_LOTTIE_BYTES) {
		throw new InvalidArgumentError(`${fileName} exceeds ${MAX_LOTTIE_BYTES / 1024} KB`);
	}

	let animation: unknown;
	try {
		animation = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new InvalidArgumentError(`${fileName} is not valid JSON`);
	}
	if (!isObject(animation)) {
		throw new InvalidArgumentError(`${fileName} must be a JSON object`);
	}

	if (typeof animation.v !== "string" || !VERSION.test(animation.v)) {
		throw new InvalidArgumentError(`${fileName} must declare a version string in v`);
	}
	if (!isFiniteNumber(animation.fr) || animation.fr <= 0) {
		throw new InvalidArgumentError(`${fileName} requires a frame rate fr greater than 0`);
	}
	const { ip, op, w, h } = animation;
	if (!isFiniteNumber(ip) || !isFiniteNumber(op) || !isFiniteNumber(w) || !isFiniteNumber(h)) {
		throw new InvalidArgumentError(`${fileName} requires numeric ip, op, w and h`);
	}
	if (op <= ip) {
		throw new InvalidArgumentError(`${fileName} requires op greater than ip`);
	}
	if (!Array.isArray(animation.layers)) {
		throw new InvalidArgumentError(`${fileName} requires a layers array`);
	}
	if ((op - ip) / animation.fr > MAX_LOTTIE_SECONDS) {
		throw new InvalidArgumentError(`${fileName} lasts longer than ${MAX_LOTTIE_SECONDS} seconds`);
	}

	const assets = animation.assets ?? [];
	if (!Array.isArray(assets)) {
		throw new InvalidArgumentError(`${fileName} requires assets to be an array`);
	}
	if (assets.some((asset) => isObject(asset) && ("p" in asset || "u" in asset))) {
		throw new InvalidArgumentError(`${fileName} embeds an image or external asset`);
	}
	if ("fonts" in animation || "chars" in animation) {
		throw new InvalidArgumentError(`${fileName} must not declare fonts or chars`);
	}
	if (
		layerGroups(animation.layers, assets).some((layers) =>
			layers.some((layer) => isObject(layer) && layer.ty === TEXT_LAYER_TYPE),
		)
	) {
		throw new InvalidArgumentError(`${fileName} contains a text layer`);
	}
	if (scanTree(fileName, animation).hasExpression) {
		throw new InvalidArgumentError(`${fileName} contains an expression`);
	}
}

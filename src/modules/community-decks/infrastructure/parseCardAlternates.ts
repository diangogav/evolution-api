import type { CardAlternates } from "../domain/CardAlternates";

const PASSCODE = /^\d+$/;

// evolution-assets `cdb/alternates.json`: `{ version: 1, alternates: { "<original>": ["<alt>"] } }`.
export function parseCardAlternates(body: unknown): CardAlternates {
	if (!isRecord(body) || body.version !== 1 || !isRecord(body.alternates)) {
		throw new Error("Unsupported card alternates document");
	}
	const map = new Map<number, number[]>();
	for (const [original, ids] of Object.entries(body.alternates)) {
		if (!PASSCODE.test(original) || !Array.isArray(ids)) {
			throw new Error(`Invalid card alternates entry ${original}`);
		}
		map.set(
			Number(original),
			ids.map((id) => {
				if (typeof id !== "string" || !PASSCODE.test(id)) {
					throw new Error(`Invalid alternate ${String(id)} of ${original}`);
				}
				return Number(id);
			}),
		);
	}
	return map;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

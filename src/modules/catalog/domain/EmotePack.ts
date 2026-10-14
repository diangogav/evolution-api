import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { assertVectorLottie } from "./LottieAnimation";

export const EMOTE_PACK_MANIFEST = "pack.json";
export const MAX_EMOTES_PER_PACK = 12;
/** The manifest plus one Lottie per emote. */
export const MAX_EMOTE_PACK_FILES = MAX_EMOTES_PER_PACK + 1;

const MANIFEST_VERSION = 1;
const MAX_KEY_LENGTH = 20;
const MAX_LABEL_LENGTH = 32;
/** `<slug>/<key>` travels over the duel wire as the emote reference. */
const MAX_REF_BYTES = 48;
const EMOTE_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface EmotePackFile {
	readonly name: string;
	readonly bytes: Uint8Array;
}

interface ManifestEmote {
	readonly key: string;
	readonly label: string;
	readonly file: string;
}

function parseManifest(bytes: Uint8Array): unknown {
	try {
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new InvalidArgumentError(`${EMOTE_PACK_MANIFEST} is not valid JSON`);
	}
}

function parseEmote(raw: unknown, slug: string): ManifestEmote {
	const entry = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
	const { key, label, file } = entry;

	if (typeof key !== "string" || key.length > MAX_KEY_LENGTH || !EMOTE_KEY.test(key)) {
		throw new InvalidArgumentError(
			`${EMOTE_PACK_MANIFEST} emote key ${JSON.stringify(key)} must be 1 to ${MAX_KEY_LENGTH} lowercase kebab-case characters`,
		);
	}
	const trimmedLabel = typeof label === "string" ? label.trim() : "";
	if (trimmedLabel.length < 1 || trimmedLabel.length > MAX_LABEL_LENGTH) {
		throw new InvalidArgumentError(
			`${EMOTE_PACK_MANIFEST} emote "${key}" needs a label of 1 to ${MAX_LABEL_LENGTH} characters`,
		);
	}
	if (file !== `${key}.json`) {
		throw new InvalidArgumentError(
			`${EMOTE_PACK_MANIFEST} emote "${key}" must use file "${key}.json"`,
		);
	}
	const ref = `${slug}/${key}`;
	if (new TextEncoder().encode(ref).byteLength > MAX_REF_BYTES) {
		throw new InvalidArgumentError(
			`${EMOTE_PACK_MANIFEST} emote ref "${ref}" exceeds ${MAX_REF_BYTES} bytes`,
		);
	}
	return { key, label: trimmedLabel, file };
}

function parseEmotes(manifest: unknown, slug: string): ManifestEmote[] {
	const root = (typeof manifest === "object" && manifest !== null ? manifest : {}) as Record<
		string,
		unknown
	>;
	if (root.version !== MANIFEST_VERSION) {
		throw new InvalidArgumentError(`${EMOTE_PACK_MANIFEST} version must be ${MANIFEST_VERSION}`);
	}
	if (!Array.isArray(root.emotes)) {
		throw new InvalidArgumentError(`${EMOTE_PACK_MANIFEST} requires an emotes array`);
	}
	if (root.emotes.length < 1 || root.emotes.length > MAX_EMOTES_PER_PACK) {
		throw new InvalidArgumentError(
			`EMOTE_PACK requires between 1 and ${MAX_EMOTES_PER_PACK} emotes`,
		);
	}

	const seen = new Set<string>();
	return root.emotes.map((raw) => {
		const emote = parseEmote(raw, slug);
		if (seen.has(emote.key)) {
			throw new InvalidArgumentError(`${EMOTE_PACK_MANIFEST} repeats emote key "${emote.key}"`);
		}
		seen.add(emote.key);
		return emote;
	});
}

/**
 * Checks that an emote pack is exactly one `pack.json` plus the Lottie files it lists,
 * and that every Lottie is valid vector-only animation.
 */
export function assertEmotePackFiles(slug: string, files: readonly EmotePackFile[]): void {
	for (const file of files) {
		if (file.name !== EMOTE_PACK_MANIFEST && !file.name.endsWith(".json")) {
			throw new InvalidArgumentError(
				`EMOTE_PACK file "${file.name}" must be ${EMOTE_PACK_MANIFEST} or a .json Lottie`,
			);
		}
	}

	const manifests = files.filter((file) => file.name === EMOTE_PACK_MANIFEST);
	if (manifests.length !== 1) {
		throw new InvalidArgumentError(`EMOTE_PACK requires exactly one ${EMOTE_PACK_MANIFEST}`);
	}
	const emotes = parseEmotes(parseManifest(manifests[0].bytes), slug);

	const lottieFiles = files.filter((file) => file.name !== EMOTE_PACK_MANIFEST);
	const listed = new Set(emotes.map((emote) => emote.file));
	for (const emote of emotes) {
		if (!lottieFiles.some((file) => file.name === emote.file)) {
			throw new InvalidArgumentError(
				`${EMOTE_PACK_MANIFEST} lists "${emote.file}" but it was not uploaded`,
			);
		}
	}
	for (const file of lottieFiles) {
		if (!listed.has(file.name)) {
			throw new InvalidArgumentError(`"${file.name}" is not listed in ${EMOTE_PACK_MANIFEST}`);
		}
		assertVectorLottie(file.name, file.bytes);
	}
}

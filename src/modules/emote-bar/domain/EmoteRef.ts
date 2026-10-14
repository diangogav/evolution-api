import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";

/** Emotes bundled with the client; they need no pack and no asset URL. */
export const DEFAULT_EMOTE_IDS: readonly string[] = [
	"wave",
	"thumbsup",
	"fire",
	"thinking",
	"cool",
	"mindblown",
	"sweat",
	"cry",
];

const MAX_REF_BYTES = 48;
const MAX_KEY_LENGTH = 20;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Names one emote: either a default id (`wave`) or `<pack-slug>/<emote-key>`. The string
 * form is what the duel wire carries, so it is capped at 48 bytes.
 */
export class EmoteRef {
	private constructor(
		private readonly raw: string,
		public readonly packSlug: string | null,
		public readonly emoteKey: string | null,
	) {}

	static parse(raw: string): EmoteRef {
		if (DEFAULT_EMOTE_IDS.includes(raw)) return new EmoteRef(raw, null, null);

		const parts = raw.split("/");
		const [slug, key] = parts;
		const wellFormed =
			parts.length === 2 &&
			KEBAB.test(slug) &&
			KEBAB.test(key) &&
			key.length <= MAX_KEY_LENGTH &&
			new TextEncoder().encode(raw).byteLength <= MAX_REF_BYTES;
		if (!wellFormed) {
			throw new InvalidArgumentError(`Invalid emote reference "${raw}"`);
		}
		return new EmoteRef(raw, slug, key);
	}

	get isDefault(): boolean {
		return this.packSlug === null;
	}

	toString(): string {
		return this.raw;
	}
}

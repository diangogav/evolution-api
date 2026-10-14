import { Cosmetic } from "../../catalog/domain/Cosmetic";
import { CosmeticType } from "../../catalog/domain/CosmeticType";
import { EMOTE_PACK_MANIFEST } from "../../catalog/domain/EmotePack";

const PACK_PREFIX = "emote-packs/";

function slugOf(assetRef: string): string | null {
	const rest = assetRef.slice(PACK_PREFIX.length);
	const slug = rest.endsWith("/") ? rest.slice(0, -1) : rest;
	return slug === "" || slug.includes("/") ? null : slug;
}

/** Active EMOTE_PACK cosmetics keyed by the slug in their `emote-packs/<slug>/` folder. */
export function activeEmotePacksBySlug(cosmetics: readonly Cosmetic[]): Map<string, Cosmetic> {
	const bySlug = new Map<string, Cosmetic>();
	for (const cosmetic of cosmetics) {
		if (cosmetic.type !== CosmeticType.EMOTE_PACK || !cosmetic.active) continue;
		if (!cosmetic.assetRef.startsWith(PACK_PREFIX)) continue;
		const slug = slugOf(cosmetic.assetRef);
		if (slug) bySlug.set(slug, cosmetic);
	}
	return bySlug;
}

export function emoteFileName(key: string): string {
	return `${key}.json`;
}

export function packHasEmote(pack: Cosmetic, key: string): boolean {
	const file = emoteFileName(key);
	return file !== EMOTE_PACK_MANIFEST && !!pack.assetFiles?.includes(file);
}

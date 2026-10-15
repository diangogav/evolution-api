import { AssetUrlSigner, SignedAssetManifest } from "../../assets/domain/AssetUrlSigner";
import { EMOTE_PACK_MANIFEST } from "../../catalog/domain/EmotePack";
import { Cosmetic } from "../../catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../catalog/domain/CosmeticRepository";
import { EntitlementsGatekeeper } from "../../entitlements/application/EntitlementsGatekeeper";
import { EMOTE_BAR_SLOTS } from "../domain/EmoteBar";
import { EmoteBarRepository } from "../domain/EmoteBarRepository";
import { DEFAULT_EMOTE_IDS, EmoteRef } from "../domain/EmoteRef";
import { activeEmotePacksBySlug, emoteFileName, packHasEmote } from "./activeEmotePacks";

export interface EmoteBarSlot {
	ref: string;
	/** Cosmetic id of the pack the emote comes from; null for a default emote. */
	packId: string | null;
	/** Signed URL of the emote's Lottie; null for a default emote, which the client bundles. */
	assetUrl: string | null;
	/** Signed URL of the pack's `pack.json`; null for a default emote. */
	packUrl: string | null;
	assetsExpiresAt: string | null;
}

export interface EmoteBarView {
	slots: EmoteBarSlot[];
}

function defaultSlot(ref: string): EmoteBarSlot {
	return { ref, packId: null, assetUrl: null, packUrl: null, assetsExpiresAt: null };
}

function parseRef(raw: string): EmoteRef | null {
	try {
		return EmoteRef.parse(raw);
	} catch {
		return null;
	}
}

/** Each stale slot takes the first default emote that no other slot of the bar shows. */
function fillStaleSlots(resolved: readonly (EmoteBarSlot | null)[]): EmoteBarSlot[] {
	const used = new Set(resolved.flatMap((slot) => (slot ? [slot.ref] : [])));
	const spare = DEFAULT_EMOTE_IDS.filter((id) => !used.has(id));
	return resolved.map((slot) => slot ?? defaultSlot(spare.shift() as string));
}

/**
 * Resolves any user's bar against the catalog and their current entitlements. Stored refs are
 * read leniently: a slot that is malformed, repeated, or no longer usable reads as the first
 * default emote the rest of the bar does not show, so the result always has distinct emotes;
 * storage is not rewritten. A stored bar of the wrong length reads as the default bar.
 */
export class GetMyEmoteBar {
	constructor(
		private readonly cosmetics: CosmeticRepository,
		private readonly bars: EmoteBarRepository,
		private readonly gatekeeper: EntitlementsGatekeeper,
		private readonly signer: AssetUrlSigner,
	) {}

	async run(userId: string): Promise<EmoteBarView> {
		const stored = await this.bars.findByUserId(userId);
		const raws = stored?.length === EMOTE_BAR_SLOTS ? stored : DEFAULT_EMOTE_IDS;

		const seen = new Set<string>();
		const refs = raws.map((raw) => {
			const ref = parseRef(raw);
			if (!ref || seen.has(raw)) return null;
			seen.add(raw);
			return ref;
		});

		const needsPacks = refs.some((ref) => ref && !ref.isDefault);
		const packs = needsPacks
			? activeEmotePacksBySlug(await this.cosmetics.findAll())
			: new Map<string, Cosmetic>();
		const access = needsPacks ? await this.gatekeeper.accessFor(userId) : null;
		const manifests = new Map<string, Promise<SignedAssetManifest>>();
		const manifestOf = (pack: Cosmetic) => {
			let manifest = manifests.get(pack.id);
			if (!manifest) {
				manifest = this.signer.signManifest(pack.assetRef, pack.assetFiles ?? undefined);
				manifests.set(pack.id, manifest);
			}
			return manifest;
		};

		const resolved = await Promise.all(
			refs.map(async (ref): Promise<EmoteBarSlot | null> => {
				if (!ref) return null;
				if (ref.isDefault) return defaultSlot(ref.toString());

				const pack = packs.get(ref.packSlug as string);
				const key = ref.emoteKey as string;
				if (!pack || !access?.canUse(pack) || !packHasEmote(pack, key)) return null;

				const manifest = await manifestOf(pack);
				const assetUrl = manifest.assets[emoteFileName(key)];
				if (!assetUrl) return null;
				return {
					ref: ref.toString(),
					packId: pack.id,
					assetUrl,
					packUrl: manifest.assets[EMOTE_PACK_MANIFEST] ?? null,
					assetsExpiresAt: manifest.expiresAt,
				};
			}),
		);
		return { slots: fillStaleSlots(resolved) };
	}
}

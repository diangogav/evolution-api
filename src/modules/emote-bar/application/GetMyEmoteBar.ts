import { AssetUrlSigner, SignedAssetManifest } from "../../assets/domain/AssetUrlSigner";
import { EMOTE_PACK_MANIFEST } from "../../catalog/domain/EmotePack";
import { Cosmetic } from "../../catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../catalog/domain/CosmeticRepository";
import { EntitlementsGatekeeper } from "../../entitlements/application/EntitlementsGatekeeper";
import { EmoteBar } from "../domain/EmoteBar";
import { EmoteBarRepository } from "../domain/EmoteBarRepository";
import { DEFAULT_EMOTE_IDS } from "../domain/EmoteRef";
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

function defaultSlot(index: number): EmoteBarSlot {
	return {
		ref: DEFAULT_EMOTE_IDS[index],
		packId: null,
		assetUrl: null,
		packUrl: null,
		assetsExpiresAt: null,
	};
}

/**
 * Resolves any user's bar against the catalog and their current entitlements. A saved slot
 * that is no longer usable reads as the default emote of that slot; storage is not rewritten.
 */
export class GetMyEmoteBar {
	constructor(
		private readonly cosmetics: CosmeticRepository,
		private readonly bars: EmoteBarRepository,
		private readonly gatekeeper: EntitlementsGatekeeper,
		private readonly signer: AssetUrlSigner,
	) {}

	async run(userId: string): Promise<EmoteBarView> {
		const bar = (await this.bars.findByUserId(userId)) ?? EmoteBar.defaults();
		const refs = bar.refs();
		if (refs.every((ref) => ref.isDefault)) {
			return { slots: refs.map((ref, index) => ({ ...defaultSlot(index), ref: ref.toString() })) };
		}

		const packs = activeEmotePacksBySlug(await this.cosmetics.findAll());
		const access = await this.gatekeeper.accessFor(userId);
		const manifests = new Map<string, Promise<SignedAssetManifest>>();
		const manifestOf = (pack: Cosmetic) => {
			let manifest = manifests.get(pack.id);
			if (!manifest) {
				manifest = this.signer.signManifest(pack.assetRef, pack.assetFiles ?? undefined);
				manifests.set(pack.id, manifest);
			}
			return manifest;
		};

		const slots = await Promise.all(
			refs.map(async (ref, index): Promise<EmoteBarSlot> => {
				if (ref.isDefault) return { ...defaultSlot(index), ref: ref.toString() };

				const pack = packs.get(ref.packSlug as string);
				const key = ref.emoteKey as string;
				if (!pack || !access.canUse(pack) || !packHasEmote(pack, key)) return defaultSlot(index);

				const manifest = await manifestOf(pack);
				const assetUrl = manifest.assets[emoteFileName(key)];
				if (!assetUrl) return defaultSlot(index);
				return {
					ref: ref.toString(),
					packId: pack.id,
					assetUrl,
					packUrl: manifest.assets[EMOTE_PACK_MANIFEST] ?? null,
					assetsExpiresAt: manifest.expiresAt,
				};
			}),
		);
		return { slots };
	}
}

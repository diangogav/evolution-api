import { t } from "elysia";

import { EMOTE_BAR_SLOTS } from "../domain/EmoteBar";

/**
 * Entry of the emote bar. Default emotes carry no URLs: the client bundles them. A pack
 * emote carries a signed URL for its Lottie and for the pack's `pack.json`.
 */
export const EmoteBarSlotSchema = t.Object({
	ref: t.String({ description: "Default emote id, or <pack-slug>/<emote-key>" }),
	packId: t.Union([t.String(), t.Null()], { description: "Cosmetic id of the pack" }),
	assetUrl: t.Union([t.String(), t.Null()], { description: "Signed URL of the emote Lottie" }),
	packUrl: t.Union([t.String(), t.Null()], { description: "Signed URL of the pack manifest" }),
	assetsExpiresAt: t.Union([t.String(), t.Null()], {
		description: "ISO 8601 expiry of the signed URLs",
	}),
});

/** Response of GET and PUT /me/emote-bar: the 8 slots in order. */
export const EmoteBarSchema = t.Object({ slots: t.Array(EmoteBarSlotSchema) });

export const SaveEmoteBarBodySchema = t.Object({
	slots: t.Array(t.String({ maxLength: 48 }), {
		minItems: EMOTE_BAR_SLOTS,
		maxItems: EMOTE_BAR_SLOTS,
		description: "The 8 emote references, in slot order, without repeats",
	}),
});

import { t } from "elysia";

import { CosmeticType } from "../../catalog/domain/CosmeticType";

/**
 * Entry of `GetMyLoadout`. `assetsExpiresAt` is absent when the equipped cosmetic id
 * no longer resolves in the catalog: `assets` then falls back to an empty manifest.
 */
export const LoadoutSlotSchema = t.Object({
	cosmeticType: t.Enum(CosmeticType),
	cosmeticId: t.String(),
	assets: t.Record(t.String(), t.String()),
	assetsExpiresAt: t.Optional(
		t.String({ description: "ISO 8601 expiry of the signed asset URLs" }),
	),
});

/**
 * Response of GET /me/loadout/, PUT /me/loadout/ and GET /users/by-username/{username}/loadout:
 * one entry per equipped slot, at most one per cosmetic type.
 */
export const LoadoutSchema = t.Array(LoadoutSlotSchema);

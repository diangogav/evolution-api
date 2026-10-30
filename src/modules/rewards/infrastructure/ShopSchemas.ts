import { t } from "elysia";

import { CosmeticTier } from "../../catalog/domain/CosmeticTier";
import { CosmeticType } from "../../catalog/domain/CosmeticType";

export const EssenceBalanceSchema = t.Object({
	balance: t.Integer({ description: "Current essence balance (sum of the user's ledger)" }),
});

export const ShopItemSchema = t.Object({
	id: t.String(),
	type: t.Enum(CosmeticType),
	tier: t.Enum(CosmeticTier),
	displayName: t.String(),
	price: t.Integer({ description: "Price in essence" }),
	owned: t.Boolean({ description: "True when the user can already use it (tier or grant)" }),
	assets: t.Record(t.String(), t.String(), {
		description: "Signed URLs of the cosmetic's files, keyed by file name, for shop previews",
	}),
	assetsExpiresAt: t.Union([t.String(), t.Null()], {
		description:
			"ISO 8601 expiry of the signed asset URLs, or null when they are public and never expire",
	}),
});

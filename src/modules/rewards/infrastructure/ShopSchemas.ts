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
});

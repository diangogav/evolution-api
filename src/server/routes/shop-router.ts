import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { EntitlementsGatekeeper } from "../../modules/entitlements/application/EntitlementsGatekeeper";
import { GrantCosmeticToUser } from "../../modules/entitlements/application/GrantCosmeticToUser";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { UserDirectoryPostgresRepository } from "../../modules/loadout/infrastructure/UserDirectoryPostgresRepository";
import { GetMyEssence } from "../../modules/rewards/application/GetMyEssence";
import { GetShop } from "../../modules/rewards/application/GetShop";
import { PurchaseCosmetic } from "../../modules/rewards/application/PurchaseCosmetic";
import { CosmeticsTransactionRunner } from "../../modules/rewards/infrastructure/CosmeticsTransactionRunner";
import { EssenceLedgerPostgresRepository } from "../../modules/rewards/infrastructure/EssenceLedgerPostgresRepository";
import { ShopCatalogPostgresRepository } from "../../modules/rewards/infrastructure/ShopCatalogPostgresRepository";
import {
	EssenceBalanceSchema,
	ShopItemSchema,
} from "../../modules/rewards/infrastructure/ShopSchemas";
import { JWT } from "../../shared/JWT";
import { banGuard } from "../guards/bandGuard";
import { errorResponses, jsonOk } from "../openapi/responses";

const jwt = new JWT(config.jwt);
const ledger = new EssenceLedgerPostgresRepository();
const entitlements = new EntitlementPostgresRepository();
const gatekeeper = new EntitlementsGatekeeper(entitlements);
const shopCatalog = new ShopCatalogPostgresRepository();
const grantCosmetic = new GrantCosmeticToUser(
	new CosmeticPostgresRepository(),
	entitlements,
	new UserDirectoryPostgresRepository(),
);

const getMyEssence = new GetMyEssence(ledger);
const getShop = new GetShop(shopCatalog, gatekeeper);
const purchaseCosmetic = new PurchaseCosmetic(
	shopCatalog,
	ledger,
	gatekeeper,
	grantCosmetic,
	new CosmeticsTransactionRunner(),
);

const userIdFrom = (token: string): string => (jwt.decode(token) as { id: string }).id;

export const essenceRouter = new Elysia({ prefix: "/me/essence" })
	.use(bearer())
	.guard(banGuard, (app) =>
		app.get("/", ({ bearer }) => getMyEssence.run(userIdFrom(bearer as string)), {
			detail: {
				tags: ["Rewards"],
				summary: "Get my essence balance",
				description: "Returns the authenticated user's essence balance.",
				security: [{ bearerAuth: [] }],
				responses: {
					200: jsonOk(EssenceBalanceSchema, "Current balance", { balance: 120 }),
					...errorResponses(401, 403),
				},
			},
		}),
	);

const shopItemExample = {
	id: "4244bc19-0f5c-4e13-b260-137fd178ff2d",
	type: "SLEEVE",
	tier: "DONOR",
	displayName: "Golden sleeve",
	price: 800,
	owned: false,
};

export const shopRouter = new Elysia({ prefix: "/shop" }).use(bearer()).guard(banGuard, (app) =>
	app
		.get("/", ({ bearer }) => getShop.run(userIdFrom(bearer as string)), {
			detail: {
				tags: ["Rewards"],
				summary: "List the shop",
				description:
					"Active cosmetics that can be bought with essence, with their price and whether the authenticated user can already use them. Assets are served by the cosmetics endpoints.",
				security: [{ bearerAuth: [] }],
				responses: {
					200: jsonOk(t.Array(ShopItemSchema), "Shop items", [shopItemExample]),
					...errorResponses(401, 403),
				},
			},
		})
		.post(
			"/:cosmeticId/purchase",
			({ bearer, params }) =>
				purchaseCosmetic.run({
					userId: userIdFrom(bearer as string),
					cosmeticId: params.cosmeticId,
				}),
			{
				params: t.Object({ cosmeticId: t.String() }),
				detail: {
					tags: ["Rewards"],
					summary: "Buy a cosmetic with essence",
					description:
						"Debits the price from the user's essence and grants the cosmetic as a PURCHASE entitlement, atomically. A cosmetic the user can already use is refused.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(EssenceBalanceSchema, "Balance after the purchase", { balance: 200 }),
						...errorResponses(401, 402, 403, 404, 409),
					},
				},
			},
		),
);

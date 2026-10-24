import { describe, expect, it } from "bun:test";

import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { EntitlementSource } from "../../../../../src/modules/entitlements/domain/EntitlementSource";
import { PurchaseCosmetic } from "../../../../../src/modules/rewards/application/PurchaseCosmetic";
import { EssenceLedgerEntry } from "../../../../../src/modules/rewards/domain/EssenceLedgerEntry";
import {
	EssenceLedgerRepository,
	QueryableManager,
} from "../../../../../src/modules/rewards/domain/EssenceLedgerRepository";
import {
	ShopCatalogRepository,
	ShopCosmetic,
} from "../../../../../src/modules/rewards/domain/ShopCatalogRepository";
import { TransactionRunner } from "../../../../../src/modules/rewards/domain/TransactionRunner";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { PaymentRequiredError } from "../../../../../src/shared/errors/PaymentRequiredError";

const sleeve: ShopCosmetic = {
	id: "sleeve-1",
	type: CosmeticType.SLEEVE,
	tier: CosmeticTier.DONOR,
	displayName: "Golden sleeve",
	essencePrice: 800,
};

class Fakes {
	balance = 0;
	ledger: EssenceLedgerEntry[] = [];
	events: string[] = [];
	owned = new Set<string>();
	granted: Array<{ userId: string; cosmeticId: string; source: EntitlementSource }> = [];

	readonly shop: ShopCatalogRepository = {
		findPurchasable: async () => [sleeve],
		findPurchasableById: async (id) => (id === sleeve.id ? sleeve : null),
	};
	readonly ledgerRepository: EssenceLedgerRepository = {
		lockUser: async (userId) => {
			this.events.push(`lock:${userId}`);
		},
		append: async (entry) => {
			this.events.push("append");
			if (this.ledger.some((e) => e.kind === entry.kind && e.referenceKey === entry.referenceKey))
				return "skipped";
			this.ledger.push(entry);
			this.balance += entry.delta;
			return "inserted";
		},
		balanceOf: async () => this.balance,
	};
	readonly gatekeeper = { canUse: async (_u: string, c: { id: string }) => this.owned.has(c.id) };
	readonly grant = {
		runForUserId: async (input: {
			userId: string;
			cosmeticId: string;
			source: EntitlementSource;
		}) => {
			this.granted.push(input);
			this.owned.add(input.cosmeticId);
			return { created: true };
		},
	};
	readonly transactions: TransactionRunner = {
		run: async <T>(work: (m: QueryableManager) => Promise<T>) => work({ query: async () => [] }),
	};

	useCase() {
		return new PurchaseCosmetic(
			this.shop,
			this.ledgerRepository,
			this.gatekeeper as never,
			this.grant as never,
			this.transactions,
		);
	}
}

describe("PurchaseCosmetic", () => {
	it("debits the price, grants the cosmetic as a PURCHASE entitlement and returns the new balance", async () => {
		const fakes = new Fakes();
		fakes.balance = 1000;

		const result = await fakes.useCase().run({ userId: "user-1", cosmeticId: "sleeve-1" });

		expect(result).toEqual({ balance: 200 });
		expect(fakes.ledger).toEqual([
			{ userId: "user-1", kind: "purchase", referenceKey: "sleeve-1", delta: -800 },
		]);
		expect(fakes.granted).toEqual([
			{ userId: "user-1", cosmeticId: "sleeve-1", source: EntitlementSource.PURCHASE },
		]);
		expect(fakes.events).toEqual(["lock:user-1", "append"]);
	});

	it("rejects with 402 when the balance does not cover the price and writes nothing", async () => {
		const fakes = new Fakes();
		fakes.balance = 799;

		await expect(fakes.useCase().run({ userId: "user-1", cosmeticId: "sleeve-1" })).rejects.toThrow(
			new PaymentRequiredError("Insufficient essence"),
		);
		expect(fakes.ledger).toHaveLength(0);
		expect(fakes.granted).toHaveLength(0);
	});

	it("rejects with 409 when the user already has access to the cosmetic", async () => {
		const fakes = new Fakes();
		fakes.balance = 1000;
		fakes.owned.add("sleeve-1");

		await expect(fakes.useCase().run({ userId: "user-1", cosmeticId: "sleeve-1" })).rejects.toThrow(
			new ConflictError("Cosmetic already owned"),
		);
		expect(fakes.ledger).toHaveLength(0);
	});

	it("rejects with 409 when the ledger already holds this purchase, so a replay never debits twice", async () => {
		const fakes = new Fakes();
		fakes.balance = 2000;
		fakes.ledger.push({
			userId: "user-1",
			kind: "purchase",
			referenceKey: "sleeve-1",
			delta: -800,
		});

		await expect(fakes.useCase().run({ userId: "user-1", cosmeticId: "sleeve-1" })).rejects.toThrow(
			ConflictError,
		);
		expect(fakes.balance).toBe(2000);
		expect(fakes.granted).toHaveLength(0);
	});

	it("rejects with 404 a cosmetic that is unknown or not purchasable", async () => {
		const fakes = new Fakes();

		await expect(fakes.useCase().run({ userId: "user-1", cosmeticId: "nope" })).rejects.toThrow(
			NotFoundError,
		);
	});
});

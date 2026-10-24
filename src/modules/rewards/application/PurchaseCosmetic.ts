import { ConflictError } from "../../../shared/errors/ConflictError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { PaymentRequiredError } from "../../../shared/errors/PaymentRequiredError";
import { EntitlementsGatekeeper } from "../../entitlements/application/EntitlementsGatekeeper";
import { GrantCosmeticToUser } from "../../entitlements/application/GrantCosmeticToUser";
import { EntitlementSource } from "../../entitlements/domain/EntitlementSource";
import { essenceLedgerEntry } from "../domain/EssenceLedgerEntry";
import { EssenceLedgerRepository } from "../domain/EssenceLedgerRepository";
import { ShopCatalogRepository } from "../domain/ShopCatalogRepository";
import { TransactionRunner } from "../domain/TransactionRunner";

export type PurchaseCosmeticInput = { userId: string; cosmeticId: string };

// Debit and grant happen under the user's ledger lock: the balance read cannot be
// undercut by a concurrent debit, and the ledger's unique (user, 'purchase', cosmetic)
// key turns a replayed purchase into a conflict instead of a second debit. The grant
// runs on the same transaction manager, so debit and grant commit or roll back together
// and the transaction never waits on a second pool connection.
export class PurchaseCosmetic {
	constructor(
		private readonly shop: ShopCatalogRepository,
		private readonly ledger: EssenceLedgerRepository,
		private readonly gatekeeper: Pick<EntitlementsGatekeeper, "canUse">,
		private readonly grantCosmetic: Pick<GrantCosmeticToUser, "runForUserId">,
		private readonly transactions: TransactionRunner,
	) {}

	async run(input: PurchaseCosmeticInput): Promise<{ balance: number }> {
		const cosmetic = await this.shop.findPurchasableById(input.cosmeticId);
		if (!cosmetic) throw new NotFoundError(`Cosmetic "${input.cosmeticId}" is not for sale`);

		if (await this.gatekeeper.canUse(input.userId, cosmetic)) {
			throw new ConflictError("Cosmetic already owned");
		}

		const balance = await this.transactions.run(async (manager) => {
			await this.ledger.lockUser(input.userId, manager);

			const current = await this.ledger.balanceOf(input.userId, manager);
			if (current < cosmetic.essencePrice) throw new PaymentRequiredError("Insufficient essence");

			const debited = await this.ledger.append(
				essenceLedgerEntry({
					userId: input.userId,
					kind: "purchase",
					referenceKey: cosmetic.id,
					delta: -cosmetic.essencePrice,
				}),
				manager,
			);
			if (debited === "skipped") throw new ConflictError("Cosmetic already owned");

			await this.grantCosmetic.runForUserId(
				{ userId: input.userId, cosmeticId: cosmetic.id, source: EntitlementSource.PURCHASE },
				manager,
			);
			return this.ledger.balanceOf(input.userId, manager);
		});

		return { balance };
	}
}

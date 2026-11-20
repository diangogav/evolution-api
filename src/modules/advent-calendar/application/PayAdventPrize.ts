import { NotFoundError } from "../../../shared/errors/NotFoundError";
import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { EntitlementSource, GrantCosmeticToUser } from "../../entitlements";
import { essenceLedgerEntry, EssenceLedgerRepository } from "../../rewards";
import { AdventPrize } from "../domain/AdventCalendar";

// Pays one prize on the caller's transaction. Idempotent per reference key: the ledger's
// unique movement key credits essence once ever, and the cosmetic grant skips an
// entitlement the player already holds.
export class PayAdventPrize {
	constructor(
		private readonly ledger: EssenceLedgerRepository,
		private readonly grantCosmetic: Pick<GrantCosmeticToUser, "runForUserId">,
	) {}

	async run(
		userId: string,
		prize: AdventPrize,
		referenceKey: string,
		manager: QueryableManager,
	): Promise<void> {
		if (prize.essence > 0) {
			await this.ledger.append(
				essenceLedgerEntry({
					userId,
					kind: "advent_calendar",
					referenceKey,
					delta: prize.essence,
				}),
				manager,
			);
		}
		for (const cosmeticId of prize.cosmeticIds) {
			try {
				await this.grantCosmetic.runForUserId(
					{ userId, cosmeticId, source: EntitlementSource.CAMPAIGN },
					manager,
				);
			} catch (error) {
				// A catalog typo or a retired cosmetic must not block the door; the lookup throws
				// before any write, so the transaction is still usable.
				if (!(error instanceof NotFoundError)) throw error;
			}
		}
	}
}

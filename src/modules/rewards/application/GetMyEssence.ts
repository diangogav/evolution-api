import { EssenceLedgerRepository } from "../domain/EssenceLedgerRepository";

export class GetMyEssence {
	constructor(private readonly ledger: EssenceLedgerRepository) {}

	async run(userId: string): Promise<{ balance: number }> {
		return { balance: await this.ledger.balanceOf(userId) };
	}
}

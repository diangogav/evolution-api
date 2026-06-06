import { GameTicket } from "../domain/GameTicket";
import { RankedTicketRepository } from "../domain/RankedTicketRepository";

export class IssueGameTicket {
	constructor(private readonly repository: RankedTicketRepository) {}

	async issue({ userId }: { userId: string }): Promise<{ ticket: string }> {
		const ticket = GameTicket.generate();

		await this.repository.save(ticket, userId);

		return { ticket: ticket.value };
	}
}

import { GameTicket } from "./GameTicket";

export interface RankedTicketRepository {
	save(ticket: GameTicket, userId: string): Promise<void>;
}

import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { UnprocessableError } from "../../../shared/errors/UnprocessableError";
import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { LightningEntry } from "../domain/LightningEntry";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningTournament } from "../domain/LightningTournament";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTerminal(tournament: Pick<LightningTournament, "status">): boolean {
	return tournament.status === "completed" || tournament.status === "cancelled";
}

// Takes the tournament row lock and the caller's entry. Every change a player makes to
// their own entry runs under this lock, so it never interleaves with a pairing or an apply.
export async function lockPlayerEntry(
	tournaments: LightningTournamentRepository,
	entries: LightningEntryRepository,
	tournamentId: string,
	userId: string,
	manager: QueryableManager,
): Promise<{ tournament: LightningTournament; entry: LightningEntry }> {
	const tournament = await tournaments.findByIdForUpdate(tournamentId, manager);
	if (!tournament) throw new NotFoundError(`Lightning tournament "${tournamentId}" not found`);
	const entry = await entries.findOne(tournamentId, userId, manager);
	if (!entry) throw new NotFoundError("You are not entered in this tournament");
	if (isTerminal(tournament)) throw new UnprocessableError("The tournament is over");
	return { tournament, entry };
}

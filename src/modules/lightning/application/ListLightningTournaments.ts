import {
	LIGHTNING_TOURNAMENT_STATUSES,
	LightningTournamentStatus,
} from "../domain/LightningTournament";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { LightningTournamentView, toTournamentView } from "./LightningViews";

export type ListLightningTournamentsInput = { status?: LightningTournamentStatus };

export type LightningTournamentListItem = LightningTournamentView & {
	/** Active entries. */
	players: number;
};

const OPEN_STATUSES: LightningTournamentStatus[] = LIGHTNING_TOURNAMENT_STATUSES.filter(
	(status) => status !== "completed" && status !== "cancelled",
);

export const LIST_LIMIT = 50;

// Without a status: everything not over yet, soonest first. A finished status lists the
// most recent ones first.
export class ListLightningTournaments {
	constructor(private readonly tournaments: LightningTournamentRepository) {}

	async run(input: ListLightningTournamentsInput): Promise<LightningTournamentListItem[]> {
		const finished = input.status === "completed" || input.status === "cancelled";
		const listings = await this.tournaments.list({
			statuses: input.status ? [input.status] : OPEN_STATUSES,
			newestFirst: finished,
			limit: LIST_LIMIT,
		});
		return listings.map(({ tournament, entryCount }) => ({
			...toTournamentView(tournament),
			players: entryCount,
		}));
	}
}

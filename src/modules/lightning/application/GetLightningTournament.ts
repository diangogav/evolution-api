import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { ReservedDuelRecordReader } from "../../reserved-duel";
import { LightningEntryStatus } from "../domain/LightningEntry";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningGameRepository } from "../domain/LightningGameRepository";
import { LightningResultRepository } from "../domain/LightningResultRepository";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { PlayerDirectory } from "../domain/PlayerDirectory";
import { LightningTournamentView, toTournamentView } from "./LightningViews";
import { liveStandings } from "./liveStandings";
import { UUID } from "./lockOpenTournament";

export type GetLightningTournamentInput = { tournamentId: string; now: Date };

export type PlayerRef = { userId: string; username: string };

export type LightningStandingView = {
	position: number;
	userId: string;
	username: string;
	status: LightningEntryStatus;
	score: number;
	wins: number;
	draws: number;
	losses: number;
	gamesPlayed: number;
	tiebreak: number;
	/** Season points and essence the final position earned; null until completed. */
	pointsAwarded: number | null;
	essenceAwarded: number | null;
};

export type WatchableGameView = {
	reservationId: string;
	/** Spectators join with `w,<roomId>`. */
	roomId: number;
	/** Null while the room is still in its lobby. */
	startedAt: string | null;
	players: [PlayerRef, PlayerRef];
};

export type LightningTournamentDetail = LightningTournamentView & {
	players: number;
	standings: LightningStandingView[];
	watchable: WatchableGameView[];
};

// Public detail: live standings while it runs, the frozen results once completed, and the
// rooms of live games (the server's record holds the room id once a room exists).
export class GetLightningTournament {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly entries: LightningEntryRepository,
		private readonly games: LightningGameRepository,
		private readonly results: LightningResultRepository,
		private readonly records: ReservedDuelRecordReader,
		private readonly players: PlayerDirectory,
	) {}

	async run(input: GetLightningTournamentInput): Promise<LightningTournamentDetail> {
		const notFound = () =>
			new NotFoundError(`Lightning tournament "${input.tournamentId}" not found`);
		if (!UUID.test(input.tournamentId)) throw notFound();
		const tournament = await this.tournaments.findById(input.tournamentId);
		if (!tournament) throw notFound();

		const entries = await this.entries.listByTournament(tournament.id);
		const statusOf = new Map(entries.map((entry) => [entry.userId, entry.status]));
		const pending = await this.games.listPending(tournament.id);
		const records = await this.records.findRecords(pending.map((game) => game.reservationId));
		const recordOf = new Map(records.map((record) => [record.reservationId, record]));

		const standings: Omit<LightningStandingView, "username">[] =
			tournament.status === "completed"
				? (await this.results.listResults(tournament.id))
						.sort((a, b) => a.position - b.position)
						.map((result) => ({
							position: result.position,
							userId: result.userId,
							status: statusOf.get(result.userId) ?? "active",
							score: result.score,
							wins: result.wins,
							draws: result.draws,
							losses: result.losses,
							gamesPlayed: result.wins + result.draws + result.losses,
							tiebreak: result.tiebreak,
							pointsAwarded: result.pointsAwarded,
							essenceAwarded: result.essenceAwarded,
						}))
				: liveStandings(entries, await this.games.listResolved(tournament.id)).map((standing) => ({
						...standing,
						status: statusOf.get(standing.userId) ?? "active",
						pointsAwarded: null,
						essenceAwarded: null,
					}));

		const live = pending.flatMap((game) => {
			const record = recordOf.get(game.reservationId);
			if (!record || record.roomId === null || record.endedAt) return [];
			return [{ game, record, roomId: record.roomId }];
		});
		const userIds = new Set([
			...standings.map((standing) => standing.userId),
			...live.flatMap(({ game }) => [game.seat0UserId, game.seat1UserId]),
		]);
		const names = await this.players.usernamesOf([...userIds]);
		const ref = (userId: string): PlayerRef => ({ userId, username: names.get(userId) ?? "" });

		return {
			...toTournamentView(tournament),
			players: entries.filter((entry) => entry.status === "active").length,
			standings: standings.map((standing) => ({
				...standing,
				username: ref(standing.userId).username,
			})),
			watchable: live.map(({ game, record, roomId }) => ({
				reservationId: game.reservationId,
				roomId,
				startedAt: record.startedAt?.toISOString() ?? null,
				players: [ref(game.seat0UserId), ref(game.seat1UserId)],
			})),
		};
	}
}

import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { ReservedDuelRecord, ReservedDuelRecordReader } from "../../reserved-duel";
import { LightningByeRepository } from "../domain/LightningByeRepository";
import { LightningEntryStatus } from "../domain/LightningEntry";
import { LightningGameResolution } from "../domain/LightningGame";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningGameRepository } from "../domain/LightningGameRepository";
import { LightningResultRepository } from "../domain/LightningResultRepository";
import { LightningTournament } from "../domain/LightningTournament";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { PlayerDirectory } from "../domain/PlayerDirectory";
import { noShowSeatsOf } from "../domain/resolveLightningGame";
import { SwissTable, swissTables } from "../domain/swissTables";
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

export type SwissTableView = {
	/** The table's latest reservation; a new one replaces it after an infrastructure void. */
	reservationId: string;
	seat0: PlayerRef;
	seat1: PlayerRef;
	/** Null while the game is being played. */
	resolution: LightningGameResolution | null;
	/** Only on a no-show: the seats that missed the room (both on a double no-show). */
	noShowSeats?: number[];
	/** The room to watch while the game is live; null otherwise. */
	roomId: number | null;
};

export type SwissRoundView = {
	number: number;
	tables: SwissTableView[];
	bye: PlayerRef | null;
};

export type LightningTournamentDetail = LightningTournamentView & {
	players: number;
	standings: LightningStandingView[];
	watchable: WatchableGameView[];
	/** The current (or last closed) Swiss round; null for an arena and before round one. */
	round: SwissRoundView | null;
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
		private readonly byes: LightningByeRepository,
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
				: liveStandings(
						entries,
						await this.games.listResolved(tournament.id),
						tournament.system,
					).map((standing) => ({
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
		const round = await this.currentRound(tournament);
		const userIds = new Set([
			...standings.map((standing) => standing.userId),
			...live.flatMap(({ game }) => [game.seat0UserId, game.seat1UserId]),
			...(round?.tables.flatMap((table) => [table.seat0UserId, table.seat1UserId]) ?? []),
			...(round?.bye ? [round.bye] : []),
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
			round: round && {
				number: round.number,
				tables: round.tables.map((table) => tableView(table, round.recordOf, ref)),
				bye: round.bye ? ref(round.bye) : null,
			},
		};
	}

	private async currentRound(
		tournament: Pick<LightningTournament, "id" | "system" | "currentRound">,
	): Promise<{
		number: number;
		tables: SwissTable[];
		bye: string | null;
		recordOf: Map<string, ReservedDuelRecord>;
	} | null> {
		if (tournament.system !== "swiss" || tournament.currentRound === 0) return null;
		const number = tournament.currentRound;
		const tables = swissTables(await this.games.listByRound(tournament.id, number));
		const records = await this.records.findRecords(
			tables.map((table) => table.latest.reservationId),
		);
		const byes = await this.byes.listByTournament(tournament.id);
		return {
			number,
			tables,
			bye: byes.find((bye) => bye.round === number)?.userId ?? null,
			recordOf: new Map(records.map((record) => [record.reservationId, record])),
		};
	}
}

function tableView(
	table: SwissTable,
	recordOf: Map<string, ReservedDuelRecord>,
	ref: (userId: string) => PlayerRef,
): SwissTableView {
	const { latest } = table;
	const record = recordOf.get(latest.reservationId) ?? null;
	const live = latest.status === "pending" && record !== null && !record.endedAt;
	return {
		reservationId: latest.reservationId,
		seat0: ref(table.seat0UserId),
		seat1: ref(table.seat1UserId),
		resolution: latest.resolution,
		...(latest.resolution === "no_show" ? { noShowSeats: noShowSeatsOf(latest, record) } : {}),
		roomId: live ? (record?.roomId ?? null) : null,
	};
}

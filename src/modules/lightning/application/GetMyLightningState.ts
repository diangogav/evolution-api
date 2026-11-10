import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { reservationPassword, ReservedDuelRecordReader } from "../../reserved-duel";
import { TransactionRunner } from "../../rewards";
import { EntryGameOutcome, LightningPresence } from "../domain/LightningEntry";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningGame, LightningGameResolution, seatOf } from "../domain/LightningGame";
import { LightningGameRepository } from "../domain/LightningGameRepository";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { PlayerDirectory } from "../domain/PlayerDirectory";
import { outcomeOfResolvedGame } from "../domain/resolveLightningGame";
import { ApplyLightningGame } from "./ApplyLightningGame";
import { PlayerRef } from "./GetLightningTournament";
import {
	LightningEntryView,
	LightningTournamentView,
	toEntryView,
	toTournamentView,
} from "./LightningViews";
import { liveStandings } from "./liveStandings";
import { UUID } from "./lockOpenTournament";

export type GetMyLightningStateInput = { tournamentId: string; userId: string; now: Date };

export type MyLightningGame = {
	reservationId: string;
	/** Room password to join the reserved duel with. */
	password: string;
	seat: 0 | 1;
	/** Null until the server opened the room. */
	roomId: number | null;
	opponent: PlayerRef;
};

export type MyLastLightningGame = {
	reservationId: string;
	resolution: LightningGameResolution;
	reason: string | null;
	outcome: EntryGameOutcome;
	opponent: PlayerRef;
	appliedAt: string | null;
};

export type MyLightningState = {
	tournament: LightningTournamentView;
	players: number;
	entry: LightningEntryView | null;
	/** The entry's presence; null when the player did not enter. */
	state: LightningPresence | null;
	game: MyLightningGame | null;
	lastGame: MyLastLightningGame | null;
	/** Place in the live standings; null when the player is not ranked. */
	position: number | null;
};

/**
 * What the waiting room polls. The caller's own pending game is applied first, under the
 * tournament row lock, so the result shows right after the duel without waiting for the
 * worker. A player with nothing pending takes no lock: the poll is a handful of reads.
 */
export class GetMyLightningState {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly entries: LightningEntryRepository,
		private readonly games: LightningGameRepository,
		private readonly records: ReservedDuelRecordReader,
		private readonly players: PlayerDirectory,
		private readonly applyGame: Pick<ApplyLightningGame, "applyGame">,
		private readonly transactions: TransactionRunner,
	) {}

	async run(input: GetMyLightningStateInput): Promise<MyLightningState> {
		const notFound = () =>
			new NotFoundError(`Lightning tournament "${input.tournamentId}" not found`);
		if (!UUID.test(input.tournamentId)) throw notFound();

		return this.transactions.run(async (manager) => {
			const pendingBefore = await this.games.findPendingForUser(
				input.tournamentId,
				input.userId,
				manager,
			);
			const tournament = pendingBefore
				? await this.tournaments.findByIdForUpdate(input.tournamentId, manager)
				: await this.tournaments.findById(input.tournamentId, manager);
			if (!tournament) throw notFound();

			let pending: LightningGame | null = null;
			if (pendingBefore) {
				// Re-read under the lock: the worker may have applied it while this request waited.
				pending = await this.games.findPendingForUser(tournament.id, input.userId, manager);
				if (pending) {
					await this.applyGame.applyGame(pending, manager, input.now);
					pending = await this.games.findPendingForUser(tournament.id, input.userId, manager);
				}
			}

			const entries = await this.entries.listByTournament(tournament.id, manager);
			const entry = entries.find((candidate) => candidate.userId === input.userId) ?? null;
			const players = entries.filter((candidate) => candidate.status === "active").length;
			const base = { tournament: toTournamentView(tournament), players };
			if (!entry) {
				return { ...base, entry: null, state: null, game: null, lastGame: null, position: null };
			}

			const last = pending
				? null
				: await this.games.findLastResolvedForUser(tournament.id, input.userId, manager);
			const shown = [pending, last].filter((game): game is LightningGame => game !== null);
			const records = await this.records.findRecords(
				shown.map((game) => game.reservationId),
				manager,
			);
			const recordOf = new Map(records.map((record) => [record.reservationId, record]));
			const opponentIds = shown.map((game) =>
				game.seat0UserId === input.userId ? game.seat1UserId : game.seat0UserId,
			);
			const names = await this.players.usernamesOf(opponentIds, manager);
			const ref = (userId: string): PlayerRef => ({ userId, username: names.get(userId) ?? "" });

			const resolved = await this.games.listResolved(tournament.id, manager);
			const standing = liveStandings(entries, resolved).find(
				(candidate) => candidate.userId === input.userId,
			);

			return {
				...base,
				entry: toEntryView(entry),
				state: entry.presence,
				game: pending ? this.gameView(pending, input.userId, recordOf, ref) : null,
				lastGame: last ? this.lastGameView(last, input.userId, recordOf, ref) : null,
				position: standing?.position ?? null,
			};
		});
	}

	private gameView(
		game: LightningGame,
		userId: string,
		recordOf: Map<string, { roomId: number | null }>,
		ref: (userId: string) => PlayerRef,
	): MyLightningGame {
		const seat = seatOf(game, userId) as 0 | 1;
		return {
			reservationId: game.reservationId,
			password: reservationPassword(game.reservationId),
			seat,
			roomId: recordOf.get(game.reservationId)?.roomId ?? null,
			opponent: ref(seat === 0 ? game.seat1UserId : game.seat0UserId),
		};
	}

	private lastGameView(
		game: LightningGame,
		userId: string,
		recordOf: Map<string, Parameters<typeof outcomeOfResolvedGame>[1]>,
		ref: (userId: string) => PlayerRef,
	): MyLastLightningGame {
		const seat = seatOf(game, userId) as 0 | 1;
		const resolution = game.resolution as LightningGameResolution;
		return {
			reservationId: game.reservationId,
			resolution,
			reason: game.reason,
			outcome: outcomeOfResolvedGame(
				{ resolution, reason: game.reason },
				recordOf.get(game.reservationId) ?? null,
				seat,
			),
			opponent: ref(seat === 0 ? game.seat1UserId : game.seat0UserId),
			appliedAt: game.appliedAt?.toISOString() ?? null,
		};
	}
}

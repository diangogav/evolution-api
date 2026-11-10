import { Logger } from "../../../shared/logger/domain/Logger";
import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { ReservationStore, ReservedDuelRecordReader } from "../../reserved-duel";
import { recordGameOutcome, recordSwissGameOutcome } from "../domain/LightningEntry";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningGame } from "../domain/LightningGame";
import { LightningGameRepository } from "../domain/LightningGameRepository";
import {
	GameResolution,
	outcomeForSeat,
	resolveLightningGame,
} from "../domain/resolveLightningGame";

/** `live`: the duel is still being played. `skipped`: an earlier transaction applied it. */
export type ApplyGameOutcome = "applied" | "stale" | "live" | "skipped";

/**
 * Applies the duel server's record of one pairing to both entries, at most once: the game
 * row leaves `pending` exactly once, whichever caller gets there first. Callers hold the
 * tournament row lock, so the worker and the players' own "/me" reads never race. Only Swiss
 * games carry a round, so the game itself says which rules score it.
 */
export class ApplyLightningGame {
	constructor(
		private readonly entries: LightningEntryRepository,
		private readonly games: LightningGameRepository,
		private readonly records: ReservedDuelRecordReader,
		private readonly reservations: ReservationStore,
		private readonly logger: Logger,
		private readonly staleAfterMs: number,
	) {}

	async applyGame(
		game: LightningGame,
		manager: QueryableManager,
		now: Date,
	): Promise<ApplyGameOutcome> {
		const [record] = await this.records.findRecords([game.reservationId], manager);
		// A Swiss round has its own deadline, which closes a hung game as a draw; voiding it as
		// stale would only re-issue the same table.
		const staleAfterMs = game.round === null ? this.staleAfterMs : Number.POSITIVE_INFINITY;
		const resolution = resolveLightningGame(game, record ?? null, now, staleAfterMs);
		if (!resolution) {
			if (record?.startedAt) await this.markPlaying(game, manager);
			return "live";
		}

		// No row after the grace period means nobody joined, unless the server claimed the key
		// in the meantime: then the record is on its way and the game stays pending.
		if (resolution.unclaimed) {
			const revoked = await this.reservations.revoke(game.reservationId);
			if (revoked === "in_use") return "live";
		}

		const marked = await this.games.resolve(
			game.reservationId,
			resolution.resolution === "void" ? "voided" : "applied",
			resolution.resolution,
			resolution.reason,
			now,
			manager,
		);
		if (marked === "skipped") return "skipped";

		const swiss = game.round !== null;
		for (const seat of [0, 1] as const) {
			const userId = seat === 0 ? game.seat0UserId : game.seat1UserId;
			const entry = await this.entries.findOne(game.tournamentId, userId, manager);
			if (!entry) continue;
			await this.entries.update(
				swiss
					? recordSwissGameOutcome(entry, outcomeForSeat(resolution, seat, "swiss"), now)
					: recordGameOutcome(entry, outcomeForSeat(resolution, seat), now),
				manager,
			);
		}

		// A duel the tournament forgot must not start late: an unclaimed key is dropped. A key
		// already claimed (`in_use`) belongs to the room that produced this very record.
		if (!resolution.unclaimed && this.shouldRevoke(resolution)) {
			await this.revokeQuietly(game.reservationId);
		}
		return resolution.stale ? "stale" : "applied";
	}

	// Presence follows the server: once the duel started, both seats are playing, which is
	// what the waiting room and the standings show.
	private async markPlaying(game: LightningGame, manager: QueryableManager): Promise<void> {
		for (const userId of [game.seat0UserId, game.seat1UserId]) {
			const entry = await this.entries.findOne(game.tournamentId, userId, manager);
			if (entry?.presence !== "paired") continue;
			await this.entries.update({ ...entry, presence: "playing" }, manager);
		}
	}

	private shouldRevoke(resolution: GameResolution): boolean {
		return resolution.resolution === "void" || resolution.resolution === "no_show";
	}

	private async revokeQuietly(reservationId: string): Promise<void> {
		try {
			await this.reservations.revoke(reservationId);
		} catch (error) {
			this.logger.error(
				`Lightning could not revoke reservation ${reservationId}: ${errorMessage(error)}`,
			);
		}
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

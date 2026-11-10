import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { LightningGame, LightningGameResolution, LightningGameStatus } from "./LightningGame";

export type ResolveGameResult = "resolved" | "skipped";

export interface LightningGameRepository {
	insert(game: LightningGame, manager: QueryableManager): Promise<void>;
	/** Pending games of a tournament, oldest issue first. */
	listPending(tournamentId: string, manager?: QueryableManager): Promise<LightningGame[]>;
	findPendingForUser(
		tournamentId: string,
		userId: string,
		manager: QueryableManager,
	): Promise<LightningGame | null>;
	/** The player's most recently resolved game, for the result shown after a duel. */
	findLastResolvedForUser(
		tournamentId: string,
		userId: string,
		manager: QueryableManager,
	): Promise<LightningGame | null>;
	/** The idempotency gate: a pending game leaves `pending` at most once. */
	resolve(
		reservationId: string,
		status: Exclude<LightningGameStatus, "pending">,
		resolution: LightningGameResolution,
		reason: string,
		appliedAt: Date,
		manager: QueryableManager,
	): Promise<ResolveGameResult>;
	/** Games that left `pending`, for standings and the tournament's history. */
	listResolved(tournamentId: string, manager?: QueryableManager): Promise<LightningGame[]>;
}

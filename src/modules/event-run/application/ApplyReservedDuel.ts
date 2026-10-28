import { NotFoundError } from "../../../shared/errors/NotFoundError";
import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { GrantCosmeticToUser } from "../../entitlements/application/GrantCosmeticToUser";
import { EntitlementSource } from "../../entitlements/domain/EntitlementSource";
import { essenceLedgerEntry } from "../../rewards/domain/EssenceLedgerEntry";
import { EssenceLedgerRepository } from "../../rewards/domain/EssenceLedgerRepository";
import { EventCatalogRepository } from "../domain/EventCatalogRepository";
import { EventDefinition, PrizeTier } from "../domain/EventDefinition";
import { EventDuelRepository } from "../domain/EventDuelRepository";
import { advanceRun, EventRun, tiersCrossed } from "../domain/EventRun";
import { EventRunRepository } from "../domain/EventRunRepository";
import { DuelResolution, resolveDuelRecord } from "../domain/ReservedDuelRecord";
import { assignRival, PickIndex, randomPickIndex } from "../domain/WaveRival";

export type ApplyCurrentResult = {
	run: EventRun;
	/** What was applied, null when nothing was (no reservation, no record, live duel). */
	resolution: DuelResolution | null;
	/** The current reservation has a record that is not terminal yet. */
	duelLive: boolean;
	prizes: PrizeTier[];
};

export type ApplyReservationResult = "applied" | "stale" | "ignored" | "not_ready";

// Stored in event_run_duels for a record that arrived after its run moved on.
const NOT_CURRENT = "not_current";

export function prizeReferenceKey(eventId: string, tier: PrizeTier): string {
	return `event:${eventId}:tier:${tier.wavesCleared}`;
}

/**
 * Applies the duel server's record of an event duel to the run that issued it, at most once
 * (event_run_duels is the gate), and pays the prize tiers the result crosses. Every method
 * runs on the caller's transaction; callers hold the run's row lock, which is what makes
 * "/me", a duel request and the worker safe to race for the same record.
 */
export class ApplyReservedDuel {
	constructor(
		private readonly catalog: EventCatalogRepository,
		private readonly runs: EventRunRepository,
		private readonly duels: EventDuelRepository,
		private readonly ledger: EssenceLedgerRepository,
		private readonly grantCosmetic: Pick<GrantCosmeticToUser, "runForUserId">,
		private readonly pick: PickIndex = randomPickIndex,
	) {}

	// For a run already locked by the caller: applies its current reservation's record when
	// that record is terminal (or stale) and returns the run as it now stands. A ready run
	// leaves with its current wave's rival drawn and stored, so every reader (and the
	// reservation issued next) sees the same bot; runs stored before rivals were drawn get
	// theirs here too, without touching their idle clock.
	async applyCurrent(
		run: EventRun,
		event: EventDefinition,
		manager: QueryableManager,
		now: Date,
	): Promise<ApplyCurrentResult> {
		const unchanged = { run, resolution: null, duelLive: false, prizes: [] };
		const reservationId = run.currentReservationId;
		const record = reservationId ? await this.duels.findRecord(reservationId, manager) : null;
		const resolution = record ? resolveDuelRecord(record, now) : null;
		if (!reservationId || !resolution) {
			const drawn = assignRival(run, event, this.pick);
			if (drawn !== run) await this.runs.update(drawn, manager);
			return { ...unchanged, run: drawn, duelLive: record !== null };
		}

		const marked = await this.duels.markApplied(reservationId, run.id, resolution, manager);
		if (marked === "skipped") {
			// Applied by an earlier transaction that did not clear the pointer; never twice.
			const cleared = assignRival(
				{ ...run, currentReservationId: null, updatedAt: now },
				event,
				this.pick,
			);
			await this.runs.update(cleared, manager);
			return { ...unchanged, run: cleared };
		}

		const next = assignRival(
			advanceRun(run, resolution, event.waves.length, now),
			event,
			this.pick,
		);
		await this.runs.update(next, manager);
		const prizes = tiersCrossed(event.prizeTiers, run.wavesCleared, next.wavesCleared);
		for (const tier of prizes) await this.payTier(run.userId, event.id, tier, manager);
		return { run: next, resolution, duelLive: false, prizes };
	}

	// Worker entry point: applies one issued reservation's record, whichever run it belongs to.
	async applyReservation(
		reservationId: string,
		manager: QueryableManager,
		now: Date,
	): Promise<ApplyReservationResult> {
		const runId = await this.duels.runIdOf(reservationId, manager);
		if (!runId) return "ignored";
		const run = await this.runs.findByIdForUpdate(runId, manager);
		if (!run) return "ignored";

		if (run.currentReservationId === reservationId) {
			const event = await this.catalog.findById(run.eventId, manager);
			if (!event) return "ignored";
			const { resolution } = await this.applyCurrent(run, event, manager, now);
			if (!resolution) return "not_ready";
			return resolution === "stale_void" ? "stale" : "applied";
		}

		// The run moved on (reissued, superseded, expired): record the result as seen so it
		// is never picked up again, and leave the run alone.
		const record = await this.duels.findRecord(reservationId, manager);
		if (!record || !resolveDuelRecord(record, now)) return "not_ready";
		await this.duels.markApplied(reservationId, run.id, NOT_CURRENT, manager);
		return "ignored";
	}

	// Idempotent per (user, event, tier): the ledger's unique movement key pays essence
	// once ever, and the cosmetic grant skips an entitlement the player already holds, so
	// crossing a tier again in a later run pays nothing (best mark).
	private async payTier(
		userId: string,
		eventId: string,
		tier: PrizeTier,
		manager: QueryableManager,
	): Promise<void> {
		if (tier.essence > 0) {
			await this.ledger.append(
				essenceLedgerEntry({
					userId,
					kind: "event_run",
					referenceKey: prizeReferenceKey(eventId, tier),
					delta: tier.essence,
				}),
				manager,
			);
		}
		for (const cosmeticId of tier.cosmeticIds) {
			try {
				await this.grantCosmetic.runForUserId(
					{ userId, cosmeticId, source: EntitlementSource.CAMPAIGN },
					manager,
				);
			} catch (error) {
				// A catalog typo or a retired cosmetic must not block the run's progress; the
				// lookup throws before any write, so the transaction is still usable.
				if (!(error instanceof NotFoundError)) throw error;
			}
		}
	}
}

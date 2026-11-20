import { ConflictError } from "../../../shared/errors/ConflictError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { PaymentRequiredError } from "../../../shared/errors/PaymentRequiredError";
import { UnprocessableError } from "../../../shared/errors/UnprocessableError";
import { essenceLedgerEntry, EssenceLedgerRepository, TransactionRunner } from "../../rewards";
import { calendarDay, doorOf, isCalendarOpen, recoveryKey } from "../domain/AdventCalendar";
import { AdventCatalogRepository } from "../domain/AdventCatalogRepository";
import { canRecoverDoor } from "../domain/DoorProgress";
import { DoorProgressRepository } from "../domain/DoorProgressRepository";
import { DoorView, toDoorView } from "./AdventCalendarView";
import { ApplyDoorDuel } from "./ApplyDoorDuel";

export type RecoverDoorInput = { userId: string; calendarId: string; day: number; now: Date };

export type RecoverDoorResult = { door: DoorView; balance: number };

/**
 * Reopens a missed door for the calendar's price. The debit happens under the user's
 * ledger lock, so the balance read cannot be undercut by a concurrent debit, and under the
 * door's row lock, so two requests cannot both find the door missed. The ledger's unique
 * (user, kind, door) key turns a replayed charge into a conflict instead of a second debit.
 */
export class RecoverDoor {
	constructor(
		private readonly catalog: AdventCatalogRepository,
		private readonly doors: DoorProgressRepository,
		private readonly applyDuel: Pick<ApplyDoorDuel, "applyCurrent">,
		private readonly ledger: EssenceLedgerRepository,
		private readonly transactions: TransactionRunner,
	) {}

	async run(input: RecoverDoorInput): Promise<RecoverDoorResult> {
		return this.transactions.run(async (manager) => {
			const calendar = await this.catalog.findById(input.calendarId, manager);
			if (!calendar) throw new NotFoundError(`Calendar "${input.calendarId}" not found`);
			const door = doorOf(calendar, input.day);
			if (!door) throw new NotFoundError(`Door ${input.day} not found`);
			if (!isCalendarOpen(calendar, input.now)) throw new UnprocessableError("Calendar is closed");
			const today = calendarDay(calendar, input.now);

			await this.ledger.lockUser(input.userId, manager);
			const locked = await this.doors.lockDoor(input.userId, calendar.id, door.day, manager);
			// A duel won on the door's own day may still be unread; it must not be charged for.
			const applied = await this.applyDuel.applyCurrent(locked, calendar, manager, input.now);
			if (!canRecoverDoor(door.day, today, applied.progress)) {
				throw new ConflictError("Only a missed door can be recovered");
			}

			const balance = await this.ledger.balanceOf(input.userId, manager);
			if (balance < calendar.recoveryPrice) throw new PaymentRequiredError("Insufficient essence");
			const debited = await this.ledger.append(
				essenceLedgerEntry({
					userId: input.userId,
					kind: "advent_calendar",
					referenceKey: recoveryKey(calendar.id, door.day),
					delta: -calendar.recoveryPrice,
				}),
				manager,
			);
			if (debited === "skipped") throw new ConflictError("Door already recovered");

			const progress = { ...applied.progress, recoveredAt: input.now };
			await this.doors.save(progress, input.now, manager);
			return {
				door: toDoorView(calendar, door, today, progress, applied.duelLive),
				balance: await this.ledger.balanceOf(input.userId, manager),
			};
		});
	}
}

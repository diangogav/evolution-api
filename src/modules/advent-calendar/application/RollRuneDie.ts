import { ConflictError } from "../../../shared/errors/ConflictError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { PickIndex, randomPickIndex } from "../../event-run";
import { EssenceLedgerRepository, TransactionRunner } from "../../rewards";
import { AdventPrize, calendarDay, dieBonusKey, doorOf } from "../domain/AdventCalendar";
import { AdventCatalogRepository } from "../domain/AdventCatalogRepository";
import { DoorProgressRepository } from "../domain/DoorProgressRepository";
import { dieBonus, rollRuneDie } from "../domain/RuneDie";
import { DoorView, toDoorView } from "./AdventCalendarView";
import { ApplyDoorDuel } from "./ApplyDoorDuel";
import { PayAdventPrize } from "./PayAdventPrize";

export type RollRuneDieInput = { userId: string; calendarId: string; day: number; now: Date };

export type RollRuneDieResult = {
	door: DoorView;
	roll: number;
	bonus: AdventPrize;
	balance: number;
};

/**
 * Rolls a cleared door's bonus die. The face is drawn by the server and stored under the
 * door's row lock before the bonus is paid, so a door has one roll ever: asking again
 * returns the stored face, and the bonus's ledger key keeps a replay from paying twice.
 * A roll stays available after the calendar closes, since the door was already won.
 */
export class RollRuneDie {
	constructor(
		private readonly catalog: AdventCatalogRepository,
		private readonly doors: DoorProgressRepository,
		private readonly applyDuel: Pick<ApplyDoorDuel, "applyCurrent">,
		private readonly payPrize: Pick<PayAdventPrize, "run">,
		private readonly ledger: Pick<EssenceLedgerRepository, "balanceOf">,
		private readonly transactions: TransactionRunner,
		private readonly pick: PickIndex = randomPickIndex,
	) {}

	async run(input: RollRuneDieInput): Promise<RollRuneDieResult> {
		return this.transactions.run(async (manager) => {
			const calendar = await this.catalog.findById(input.calendarId, manager);
			if (!calendar) throw new NotFoundError(`Calendar "${input.calendarId}" not found`);
			const door = doorOf(calendar, input.day);
			if (!door) throw new NotFoundError(`Door ${input.day} not found`);
			const today = calendarDay(calendar, input.now);

			const locked = await this.doors.lockDoor(input.userId, calendar.id, door.day, manager);
			// A win the player has not read yet counts: they can roll right after the duel.
			let { progress } = await this.applyDuel.applyCurrent(locked, calendar, manager, input.now);
			if (!progress.clearedAt) throw new ConflictError("Clear this door before rolling its die");

			if (progress.dieRoll === null) {
				progress = { ...progress, dieRoll: rollRuneDie(this.pick) };
				await this.doors.save(progress, input.now, manager);
			}
			const roll = progress.dieRoll as number;
			const bonus = dieBonus(calendar.die, roll);
			await this.payPrize.run(input.userId, bonus, dieBonusKey(calendar.id, door.day), manager);

			return {
				door: toDoorView(calendar, door, today, progress),
				roll,
				bonus,
				balance: await this.ledger.balanceOf(input.userId, manager),
			};
		});
	}
}

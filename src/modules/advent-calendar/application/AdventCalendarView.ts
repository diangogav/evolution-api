import { AdventCalendar, AdventDoor, AdventPrize } from "../domain/AdventCalendar";
import {
	canRollDie,
	DoorProgress,
	DoorStatus,
	doorStatus,
	wonFirstTry,
} from "../domain/DoorProgress";
import { dieBonus } from "../domain/RuneDie";

export type DoorView = {
	day: number;
	status: DoorStatus;
	botName: string;
	prize: AdventPrize;
	attempts: number;
	firstTry: boolean;
	recovered: boolean;
	dieRoll: number | null;
	dieBonus: AdventPrize | null;
	canRoll: boolean;
	duelLive: boolean;
};

export function toDoorView(
	calendar: AdventCalendar,
	door: AdventDoor,
	today: number,
	progress: DoorProgress | null,
	duelLive = false,
): DoorView {
	const dieRoll = progress?.dieRoll ?? null;
	return {
		day: door.day,
		status: doorStatus(door.day, today, progress),
		botName: door.botName,
		prize: { essence: door.prize.essence, cosmeticIds: [...door.prize.cosmeticIds] },
		attempts: progress?.attempts ?? 0,
		firstTry: progress !== null && wonFirstTry(progress),
		recovered: Boolean(progress?.recoveredAt),
		dieRoll,
		dieBonus: dieRoll === null ? null : dieBonus(calendar.die, dieRoll),
		canRoll: canRollDie(progress),
		duelLive,
	};
}

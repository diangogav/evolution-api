import { PickIndex } from "../../event-run";
import { AdventDie, AdventPrize } from "./AdventCalendar";

export const DIE_FACES = 6;

export class RuneDieError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RuneDieError";
	}
}

// The roll's only source of randomness is `pick`, which the server owns; a client never
// supplies a face.
export function rollRuneDie(pick: PickIndex): number {
	return pick(DIE_FACES) + 1;
}

export function dieBonus(die: AdventDie, roll: number): AdventPrize {
	if (roll === DIE_FACES)
		return { essence: die.rare.essence, cosmeticIds: [...die.rare.cosmeticIds] };
	const essence = Number.isInteger(roll) ? die.essence[roll - 1] : undefined;
	if (essence === undefined) throw new RuneDieError(`The rune die has no face ${roll}`);
	return { essence, cosmeticIds: [] };
}

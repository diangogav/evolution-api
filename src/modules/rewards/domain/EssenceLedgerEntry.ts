export const ESSENCE_LEDGER_KINDS = [
	"mission",
	"daily_bonus",
	"achievement",
	"purchase",
	"adjustment",
	"event_run",
] as const;

export type EssenceLedgerKind = (typeof ESSENCE_LEDGER_KINDS)[number];

// One signed movement of essence. The balance is never stored: it is the sum of a
// user's deltas. (userId, kind, referenceKey) identifies the movement, so appending the
// same movement twice is a no-op instead of a double credit.
export type EssenceLedgerEntry = {
	userId: string;
	kind: EssenceLedgerKind;
	referenceKey: string;
	delta: number;
};

export class InvalidEssenceLedgerEntryError extends Error {
	constructor(reason: string) {
		super(`Invalid essence ledger entry: ${reason}`);
		this.name = "InvalidEssenceLedgerEntryError";
	}
}

export function essenceLedgerEntry(input: EssenceLedgerEntry): EssenceLedgerEntry {
	if (!Number.isInteger(input.delta)) {
		throw new InvalidEssenceLedgerEntryError("delta must be an integer");
	}
	if (input.delta === 0) {
		throw new InvalidEssenceLedgerEntryError("delta must not be zero");
	}
	if (input.referenceKey.trim().length === 0) {
		throw new InvalidEssenceLedgerEntryError("referenceKey must not be empty");
	}

	return {
		userId: input.userId,
		kind: input.kind,
		referenceKey: input.referenceKey,
		delta: input.delta,
	};
}

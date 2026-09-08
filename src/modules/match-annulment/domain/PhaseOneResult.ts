export type TouchedKey = { userId: string; rankId: string; season: number };

// Value returned by every phase-1 run; only genuine infrastructure failures
// throw out of the repository — every business rejection is a value here.
export type PhaseOneResult =
	| { outcome: "annulled" | "un-annulled"; touchedKeys: TouchedKey[]; reversed: boolean }
	| { outcome: "already" | "not-annulled" }
	| { outcome: "not-found" }
	| { outcome: "conflict"; reason: string };

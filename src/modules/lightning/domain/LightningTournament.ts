import { estimatedSwissEnd, swissRoundCount } from "./swissRounds";

// The matchmaking formats the duel server knows; each one has a ban list the API can
// validate registered decks against.
export const LIGHTNING_FORMATS = ["tcg", "edison", "jtp"] as const;

export type LightningFormat = (typeof LIGHTNING_FORMATS)[number];

// Arena pairs whoever is free until the clock ends; Swiss plays fixed rounds, everyone every round.
export const LIGHTNING_SYSTEMS = ["arena", "swiss"] as const;

export type LightningSystem = (typeof LIGHTNING_SYSTEMS)[number];

export const LIGHTNING_TOURNAMENT_STATUSES = [
	"scheduled",
	"registration",
	"running",
	"finishing",
	"completed",
	"cancelled",
] as const;

export type LightningTournamentStatus = (typeof LIGHTNING_TOURNAMENT_STATUSES)[number];

// An entry in one of these can still be called to a duel, or is waiting for the start.
export const LIVE_LIGHTNING_TOURNAMENT_STATUSES = ["registration", "running", "finishing"] as const;

export type LiveLightningTournamentStatus = (typeof LIVE_LIGHTNING_TOURNAMENT_STATUSES)[number];

/** Prize per final position: index 0 is first place; `others` pays every ranked player below. */
export type PrizeTable = { positions: number[]; others: number };

export const DEFAULT_POINTS_BY_POSITION: PrizeTable = { positions: [10, 7, 5, 3], others: 1 };
// `others` pays every ranked player below the podium: finishing a tournament always earns essence.
export const DEFAULT_ESSENCE_BY_POSITION: PrizeTable = { positions: [300, 200, 100], others: 25 };

// The turn times the server's rule parser can express exactly: whole seconds, one minute up.
export const MIN_TURN_TIME_SECONDS = 60;
export const MAX_TURN_TIME_SECONDS = 998;
export const DEFAULT_TURN_TIME_SECONDS = 90;
export const DEFAULT_LOBBY_TIMEOUT_SECONDS = 90;
export const DEFAULT_MIN_PLAYERS = 4;
export const DEFAULT_MAX_PLAYERS = 64;
export const MAX_NAME_LENGTH = 80;
export const MIN_SWISS_ROUNDS = 2;
export const MAX_SWISS_ROUNDS = 9;
export const DEFAULT_ROUND_MINUTES = 40;
export const MIN_ROUND_MINUTES = 10;
export const MAX_ROUND_MINUTES = 120;
export const DEFAULT_ROUND_BREAK_SECONDS = 60;
export const MAX_ROUND_BREAK_SECONDS = 600;

export type LightningTournament = {
	id: string;
	name: string;
	format: LightningFormat;
	status: LightningTournamentStatus;
	system: LightningSystem;
	season: number;
	registrationOpensAt: Date;
	startsAt: Date;
	/** Arena: no new pairings after it. Swiss: an estimate shown to players. */
	endsAt: Date;
	turnTimeSeconds: number;
	lobbyTimeoutSeconds: number;
	minPlayers: number;
	maxPlayers: number;
	pointsByPosition: PrizeTable;
	essenceByPosition: PrizeTable;
	createdBy: string;
	cancelledReason: string | null;
	/** Swiss rounds; null for an arena, and for a Swiss tournament until it starts. */
	rounds: number | null;
	/** The live (or last closed) Swiss round; 0 before the first one is paired. */
	currentRound: number;
	roundMinutes: number;
	roundBreakSeconds: number;
	roundStartedAt: Date | null;
	/** When every game of the current round was resolved; null while it is live. */
	roundClosedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

export class InvalidLightningTournamentError extends Error {
	constructor(reason: string) {
		super(`Invalid lightning tournament: ${reason}`);
		this.name = "InvalidLightningTournamentError";
	}
}

export type NewLightningTournament = {
	id: string;
	name: string;
	format: LightningFormat;
	system?: LightningSystem;
	season: number;
	registrationOpensAt: Date;
	startsAt: Date;
	/** Required for an arena; a Swiss tournament estimates its own. */
	endsAt?: Date;
	/** Swiss only; null or missing computes it from the field at start. */
	rounds?: number | null;
	roundMinutes?: number;
	roundBreakSeconds?: number;
	turnTimeSeconds?: number;
	lobbyTimeoutSeconds?: number;
	minPlayers?: number;
	maxPlayers?: number;
	pointsByPosition?: PrizeTable;
	essenceByPosition?: PrizeTable;
	createdBy: string;
	now: Date;
};

// Defaults are copied onto the row: changing them later never rewrites a past tournament.
export function lightningTournament(input: NewLightningTournament): LightningTournament {
	const name = input.name.trim();
	if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
		throw new InvalidLightningTournamentError(`name must have 1 to ${MAX_NAME_LENGTH} characters`);
	}
	if (!LIGHTNING_FORMATS.includes(input.format)) {
		throw new InvalidLightningTournamentError(`unknown format "${input.format}"`);
	}
	const system = input.system ?? "arena";
	if (!LIGHTNING_SYSTEMS.includes(system)) {
		throw new InvalidLightningTournamentError(`unknown system "${system}"`);
	}
	if (system === "arena" && !input.endsAt) {
		throw new InvalidLightningTournamentError("an arena needs endsAt");
	}
	// An unparseable date compares false against everything, which would pass every check below.
	for (const [label, date] of [
		["registrationOpensAt", input.registrationOpensAt],
		["startsAt", input.startsAt],
		["endsAt", input.endsAt],
	] as const) {
		if (date && Number.isNaN(date.getTime())) {
			throw new InvalidLightningTournamentError(`${label} is not a valid date`);
		}
	}
	if (!Number.isInteger(input.season) || input.season < 1) {
		throw new InvalidLightningTournamentError("season must be a positive integer");
	}
	if (input.startsAt.getTime() <= input.now.getTime()) {
		throw new InvalidLightningTournamentError("startsAt must be in the future");
	}
	if (input.registrationOpensAt.getTime() > input.startsAt.getTime()) {
		throw new InvalidLightningTournamentError("registration must open before the start");
	}
	if (system === "arena" && (input.endsAt as Date).getTime() <= input.startsAt.getTime()) {
		throw new InvalidLightningTournamentError("endsAt must be after startsAt");
	}

	const turnTimeSeconds = input.turnTimeSeconds ?? DEFAULT_TURN_TIME_SECONDS;
	if (
		!Number.isInteger(turnTimeSeconds) ||
		turnTimeSeconds < MIN_TURN_TIME_SECONDS ||
		turnTimeSeconds > MAX_TURN_TIME_SECONDS
	) {
		throw new InvalidLightningTournamentError(
			`turnTimeSeconds must be an integer between ${MIN_TURN_TIME_SECONDS} and ${MAX_TURN_TIME_SECONDS}`,
		);
	}
	const lobbyTimeoutSeconds = input.lobbyTimeoutSeconds ?? DEFAULT_LOBBY_TIMEOUT_SECONDS;
	if (!Number.isInteger(lobbyTimeoutSeconds) || lobbyTimeoutSeconds < 1) {
		throw new InvalidLightningTournamentError("lobbyTimeoutSeconds must be a positive integer");
	}
	const minPlayers = input.minPlayers ?? DEFAULT_MIN_PLAYERS;
	const maxPlayers = input.maxPlayers ?? DEFAULT_MAX_PLAYERS;
	if (!Number.isInteger(minPlayers) || minPlayers < 2) {
		throw new InvalidLightningTournamentError("minPlayers must be at least 2");
	}
	if (!Number.isInteger(maxPlayers) || maxPlayers < minPlayers) {
		throw new InvalidLightningTournamentError("maxPlayers must be at least minPlayers");
	}
	const rounds = system === "swiss" ? (input.rounds ?? null) : null;
	if (rounds !== null && !integerBetween(rounds, MIN_SWISS_ROUNDS, MAX_SWISS_ROUNDS)) {
		throw new InvalidLightningTournamentError(
			`rounds must be an integer between ${MIN_SWISS_ROUNDS} and ${MAX_SWISS_ROUNDS}`,
		);
	}
	const roundMinutes = input.roundMinutes ?? DEFAULT_ROUND_MINUTES;
	if (!integerBetween(roundMinutes, MIN_ROUND_MINUTES, MAX_ROUND_MINUTES)) {
		throw new InvalidLightningTournamentError(
			`roundMinutes must be an integer between ${MIN_ROUND_MINUTES} and ${MAX_ROUND_MINUTES}`,
		);
	}
	const roundBreakSeconds = input.roundBreakSeconds ?? DEFAULT_ROUND_BREAK_SECONDS;
	if (!integerBetween(roundBreakSeconds, 0, MAX_ROUND_BREAK_SECONDS)) {
		throw new InvalidLightningTournamentError(
			`roundBreakSeconds must be an integer between 0 and ${MAX_ROUND_BREAK_SECONDS}`,
		);
	}
	// Before the start the field is unknown, so the estimate assumes it fills up.
	const endsAt =
		system === "swiss"
			? estimatedSwissEnd({
					startsAt: input.startsAt,
					rounds: rounds ?? swissRoundCount(maxPlayers),
					roundMinutes,
					roundBreakSeconds,
				})
			: (input.endsAt as Date);

	return {
		id: input.id,
		name,
		format: input.format,
		status:
			input.registrationOpensAt.getTime() <= input.now.getTime() ? "registration" : "scheduled",
		system,
		season: input.season,
		registrationOpensAt: input.registrationOpensAt,
		startsAt: input.startsAt,
		endsAt,
		turnTimeSeconds,
		lobbyTimeoutSeconds,
		minPlayers,
		maxPlayers,
		pointsByPosition: prizeTable(input.pointsByPosition ?? DEFAULT_POINTS_BY_POSITION, "points"),
		essenceByPosition: prizeTable(
			input.essenceByPosition ?? DEFAULT_ESSENCE_BY_POSITION,
			"essence",
		),
		createdBy: input.createdBy,
		cancelledReason: null,
		rounds,
		currentRound: 0,
		roundMinutes,
		roundBreakSeconds,
		roundStartedAt: null,
		roundClosedAt: null,
		createdAt: input.now,
		updatedAt: input.now,
	};
}

function integerBetween(value: number, min: number, max: number): boolean {
	return Number.isInteger(value) && value >= min && value <= max;
}

function prizeTable(table: PrizeTable, label: string): PrizeTable {
	const amounts = [...table.positions, table.others];
	if (amounts.some((amount) => !Number.isInteger(amount) || amount < 0)) {
		throw new InvalidLightningTournamentError(`${label} must be non-negative integers`);
	}
	return { positions: [...table.positions], others: table.others };
}

/** What the table pays a 1-based final position. */
export function prizeForPosition(table: PrizeTable, position: number): number {
	return table.positions[position - 1] ?? table.others;
}

// Late registration is part of the arena: a player joining mid-way starts at zero. Swiss
// rounds are paired from a fixed field, so its entries close at the start.
export function acceptsEntries(
	status: LightningTournamentStatus,
	system: LightningSystem = "arena",
): boolean {
	if (status === "registration") return true;
	return status === "running" && system === "arena";
}

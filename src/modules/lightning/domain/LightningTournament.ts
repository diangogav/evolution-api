// The matchmaking formats the duel server knows; each one has a ban list the API can
// validate registered decks against.
export const LIGHTNING_FORMATS = ["tcg", "edison", "jtp"] as const;

export type LightningFormat = (typeof LIGHTNING_FORMATS)[number];

export const LIGHTNING_TOURNAMENT_STATUSES = [
	"scheduled",
	"registration",
	"running",
	"finishing",
	"completed",
	"cancelled",
] as const;

export type LightningTournamentStatus = (typeof LIGHTNING_TOURNAMENT_STATUSES)[number];

/** Prize per final position: index 0 is first place; `others` pays every ranked player below. */
export type PrizeTable = { positions: number[]; others: number };

export const DEFAULT_POINTS_BY_POSITION: PrizeTable = { positions: [10, 7, 5, 3], others: 1 };
export const DEFAULT_ESSENCE_BY_POSITION: PrizeTable = { positions: [], others: 0 };

// The turn times the server's rule parser can express exactly: whole seconds, one minute up.
export const MIN_TURN_TIME_SECONDS = 60;
export const MAX_TURN_TIME_SECONDS = 998;
export const DEFAULT_TURN_TIME_SECONDS = 90;
export const DEFAULT_LOBBY_TIMEOUT_SECONDS = 90;
export const DEFAULT_MIN_PLAYERS = 4;
export const DEFAULT_MAX_PLAYERS = 64;
export const MAX_NAME_LENGTH = 80;

export type LightningTournament = {
	id: string;
	name: string;
	format: LightningFormat;
	status: LightningTournamentStatus;
	season: number;
	registrationOpensAt: Date;
	startsAt: Date;
	endsAt: Date;
	turnTimeSeconds: number;
	lobbyTimeoutSeconds: number;
	minPlayers: number;
	maxPlayers: number;
	pointsByPosition: PrizeTable;
	essenceByPosition: PrizeTable;
	createdBy: string;
	cancelledReason: string | null;
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
	season: number;
	registrationOpensAt: Date;
	startsAt: Date;
	endsAt: Date;
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
	if (!Number.isInteger(input.season) || input.season < 1) {
		throw new InvalidLightningTournamentError("season must be a positive integer");
	}
	if (input.startsAt.getTime() <= input.now.getTime()) {
		throw new InvalidLightningTournamentError("startsAt must be in the future");
	}
	if (input.registrationOpensAt.getTime() > input.startsAt.getTime()) {
		throw new InvalidLightningTournamentError("registration must open before the start");
	}
	if (input.endsAt.getTime() <= input.startsAt.getTime()) {
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

	return {
		id: input.id,
		name,
		format: input.format,
		status:
			input.registrationOpensAt.getTime() <= input.now.getTime() ? "registration" : "scheduled",
		season: input.season,
		registrationOpensAt: input.registrationOpensAt,
		startsAt: input.startsAt,
		endsAt: input.endsAt,
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
		createdAt: input.now,
		updatedAt: input.now,
	};
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

// Late registration is part of the arena: a player joining mid-way starts at zero.
export function acceptsEntries(status: LightningTournamentStatus): boolean {
	return status === "registration" || status === "running";
}

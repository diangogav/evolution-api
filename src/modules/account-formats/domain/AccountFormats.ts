import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";

/**
 * Formats a player can choose to play, in the order the client lists them when creating a
 * room. The ids are shared with the client and the duel server.
 */
export const ACCOUNT_FORMATS = [
	"tcg",
	"ocg",
	"edison",
	"goat",
	"jtp",
	"jtp-adv-2007-03",
	"genesys",
	"rush",
	"pre",
	"speed",
] as const;

export type AccountFormat = (typeof ACCOUNT_FORMATS)[number];

function isAccountFormat(value: unknown): value is AccountFormat {
	return (ACCOUNT_FORMATS as readonly unknown[]).includes(value);
}

/**
 * Validates a player's choice and returns it deduplicated in catalogue order. An empty list
 * is a valid choice: it means the player plays none of the formats.
 */
export function accountFormats(value: unknown): AccountFormat[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new InvalidArgumentError("formats must be a list of format ids");
	}
	const unknown = value.filter((item) => !isAccountFormat(item));
	if (unknown.length > 0) {
		throw new InvalidArgumentError(
			`Unknown format ids: ${[...new Set(unknown)].join(", ")}. Known ids: ${ACCOUNT_FORMATS.join(", ")}`,
		);
	}
	return ACCOUNT_FORMATS.filter((format) => value.includes(format));
}

/**
 * Reads a stored choice back. Ids dropped from the catalogue since they were stored are
 * skipped instead of failing the read.
 */
export function storedAccountFormats(stored: readonly string[]): AccountFormat[] {
	return ACCOUNT_FORMATS.filter((format) => stored.includes(format));
}

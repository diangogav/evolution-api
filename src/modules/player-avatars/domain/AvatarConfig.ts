import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";

/**
 * The choices behind a player's bust avatar, e.g. { hairStyle: "spiky", hairColor: "purple" }.
 * The web owns the catalog of options and draws the image, so only the shape is checked here:
 * adding a hair style needs no API change, and the web falls back to defaults for values it
 * does not know.
 */
export type AvatarConfig = Readonly<Record<string, string>>;

export const MAX_AVATAR_ENTRIES = 24;
const AVATAR_KEY_PATTERN = /^[a-zA-Z]{1,24}$/;
const AVATAR_VALUE_PATTERN = /^[a-z0-9-]{1,32}$/;

export class InvalidAvatarConfigError extends InvalidArgumentError {
	constructor(message: string) {
		super(message);
		this.name = "InvalidAvatarConfigError";
	}
}

function shapeProblem(value: unknown): string | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return "Avatar must be an object of choices";
	}
	const entries = Object.entries(value);
	if (entries.length > MAX_AVATAR_ENTRIES) {
		return `Avatar can have at most ${MAX_AVATAR_ENTRIES} choices`;
	}
	for (const [key, choice] of entries) {
		if (!AVATAR_KEY_PATTERN.test(key)) return `Invalid avatar part "${key.slice(0, 32)}"`;
		if (typeof choice !== "string" || !AVATAR_VALUE_PATTERN.test(choice)) {
			return `Invalid choice for avatar part "${key}"`;
		}
	}
	return null;
}

export function isAvatarConfig(value: unknown): value is AvatarConfig {
	return shapeProblem(value) === null;
}

export function avatarConfig(input: unknown): AvatarConfig {
	const problem = shapeProblem(input);
	if (problem) throw new InvalidAvatarConfigError(problem);
	return Object.freeze({ ...(input as Record<string, string>) });
}

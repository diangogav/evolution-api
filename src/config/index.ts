import * as dotenv from "dotenv";
import type jwt from "jsonwebtoken";

dotenv.config();

function ensureEnvVariable(variable: string, variableName: string): string {
	if (!variable) {
		throw new Error(`Environment variable ${variableName} is not set`);
	}

	return variable;
}

function jwtExpiration(value = "24h"): jwt.SignOptions["expiresIn"] {
	if (!/^\d+[smhd]$/.test(value)) {
		throw new Error("Environment variable JWT_EXPIRES_IN must use formats such as 30m, 8h or 7d");
	}
	return value as jwt.SignOptions["expiresIn"];
}

/**
 * Base URL the CDN serves active cosmetics from (e.g. https://cdn.example.com/cosmetics).
 * Unset keeps every cosmetic asset behind signed URLs.
 */
export function parseCosmeticsPublicBaseUrl(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) {
		return undefined;
	}

	let url: URL | undefined;
	try {
		url = new URL(trimmed);
	} catch {
		url = undefined;
	}
	if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
		throw new Error("Environment variable COSMETICS_PUBLIC_BASE_URL must be an http(s) URL");
	}

	return trimmed.replace(/\/+$/, "");
}

export type PushConfig = {
	vapidPublicKey: string;
	vapidPrivateKey: string;
	vapidSubject: string;
};

/**
 * VAPID keys and contact for Web Push. Push is on only when all three are set; with any
 * of them missing it is off (no sends, no public key). The subject must be a `mailto:`
 * or `https:` URL, which push services require to reach the sender.
 */
export function parsePushConfig(env: Record<string, string | undefined>): PushConfig | null {
	const vapidPublicKey = env.VAPID_PUBLIC_KEY?.trim();
	const vapidPrivateKey = env.VAPID_PRIVATE_KEY?.trim();
	const vapidSubject = env.VAPID_SUBJECT?.trim();
	if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return null;
	if (!vapidSubject.startsWith("mailto:") && !vapidSubject.startsWith("https:")) {
		throw new Error("Environment variable VAPID_SUBJECT must be a mailto: or https: URL");
	}
	return { vapidPublicKey, vapidPrivateKey, vapidSubject };
}

export type DiscordAuthConfig = {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
};

/**
 * Credentials of the Discord application used to sign in. Signing in with Discord is on
 * only when all three are set; with any of them missing its endpoints answer 404. The
 * redirect URI is this API's callback and must match the one registered in Discord.
 */
export function parseDiscordAuthConfig(
	env: Record<string, string | undefined>,
): DiscordAuthConfig | null {
	const clientId = env.DISCORD_CLIENT_ID?.trim();
	const clientSecret = env.DISCORD_CLIENT_SECRET?.trim();
	const redirectUri = env.DISCORD_REDIRECT_URI?.trim();
	if (!clientId || !clientSecret || !redirectUri) return null;
	if (!/^https?:\/\//.test(redirectUri)) {
		throw new Error("Environment variable DISCORD_REDIRECT_URI must be an http(s) URL");
	}
	return { clientId, clientSecret, redirectUri };
}

const isProduction = process.env.NODE_ENV === "production";

export const config = {
	resend: {
		apiKey: ensureEnvVariable(process.env.RESEND_API_KEY as string, "RESEND_API_KEY"),
		from: ensureEnvVariable(process.env.RESEND_FROM_EMAIL as string, "RESEND_FROM_EMAIL"),
	},
	jwt: {
		secret: ensureEnvVariable(process.env.JWT_SECRET as string, "JWT_SECRET"),
		issuer: ensureEnvVariable(process.env.JWT_ISSUER as string, "JWT_ISSUER"),
		expiresIn: jwtExpiration(process.env.JWT_EXPIRES_IN?.trim()),
	},
	redis: {
		url: ensureEnvVariable(process.env.REDIS_URL as string, "REDIS_URL"),
	},
	r2: {
		accessKeyId: ensureEnvVariable(process.env.R2_ACCESS_KEY_ID as string, "R2_ACCESS_KEY_ID"),
		secretAccessKey: ensureEnvVariable(
			process.env.R2_SECRET_ACCESS_KEY as string,
			"R2_SECRET_ACCESS_KEY",
		),
		bucket: ensureEnvVariable(process.env.R2_BUCKET as string, "R2_BUCKET"),
		endpoint: ensureEnvVariable(process.env.R2_ENDPOINT as string, "R2_ENDPOINT"),
		signedUrlTtlSeconds: Number(process.env.R2_SIGNED_URL_TTL ?? "600"),
	},
	cosmeticsPublicBaseUrl: parseCosmeticsPublicBaseUrl(process.env.COSMETICS_PUBLIC_BASE_URL),
	season: Number(ensureEnvVariable(process.env.SEASON as string, "SEASON")),
	rewardsWorker: {
		enabled: process.env.REWARDS_WORKER_ENABLED === "true",
		intervalMs: Number(process.env.REWARDS_WORKER_INTERVAL_MS ?? 3000),
		lagMs: Number(process.env.REWARDS_WORKER_LAG_MS ?? 5000),
		batchSize: Number(process.env.REWARDS_WORKER_BATCH_SIZE ?? 200),
		achievementWindowHours: Number(process.env.REWARDS_ACHIEVEMENT_WINDOW_HOURS ?? 168),
	},
	eventRunWorker: {
		enabled: process.env.EVENT_RUN_WORKER_ENABLED === "true",
		intervalMs: Number(process.env.EVENT_RUN_WORKER_INTERVAL_MS ?? 5000),
		batchSize: Number(process.env.EVENT_RUN_WORKER_BATCH_SIZE ?? 100),
	},
	lightningWorker: {
		enabled: process.env.LIGHTNING_WORKER_ENABLED === "true",
		intervalMs: Number(process.env.LIGHTNING_WORKER_INTERVAL_MS ?? 5000),
		staleGameMinutes: Number(process.env.LIGHTNING_STALE_GAME_MINUTES ?? 45),
	},
	communityDecksWorker: {
		enabled: process.env.COMMUNITY_DECKS_WORKER_ENABLED === "true",
		intervalMs: Number(process.env.COMMUNITY_DECKS_WORKER_INTERVAL_MS ?? 86_400_000),
		maxPages: Number(process.env.COMMUNITY_DECKS_MAX_PAGES ?? 10),
		edisonMinViews: Number(process.env.COMMUNITY_DECKS_EDISON_MIN_VIEWS ?? 100),
	},
	push: parsePushConfig(process.env),
	discordAuth: parseDiscordAuthConfig(process.env),
	// Frontends a Discord sign-in may return to; the first one is the default.
	discordLogin: {
		secureCookie: isProduction,
		frontends: [
			{ origin: "https://evoduel.com", template: "https://evoduel.com/#/auth/discord?{query}" },
			...(isProduction
				? []
				: [
						{
							origin: "http://localhost:5173",
							template: "http://localhost:5173/#/auth/discord?{query}",
						},
					]),
		],
	},
	annulment: { enabled: process.env.ANNULMENT_ENABLED === "true" },
	// Frontend page that confirms an email address; the first entry is also the default.
	emailVerification: {
		defaultUrl: "https://evoduel.com/#/verify-email?token={token}",
		frontends: [
			{
				origin: "https://evoduel.com",
				template: "https://evoduel.com/#/verify-email?token={token}",
			},
			...(isProduction
				? []
				: [
						{
							origin: "http://localhost:5173",
							template: "http://localhost:5173/#/verify-email?token={token}",
						},
					]),
		],
	},
	passwordRecovery: {
		defaultResetUrl: "https://evolutionygo.com/reset-account-password?token={token}",
		frontends: [
			{
				origin: "https://evolutionygo.com",
				template: "https://evolutionygo.com/reset-account-password?token={token}",
			},
			{
				origin: "https://evoduel.com",
				template: "https://evoduel.com/#/reset-account-password?token={token}",
			},
			...(isProduction
				? []
				: [
						{
							origin: "http://localhost:5173",
							template: "http://localhost:5173/#/reset-account-password?token={token}",
						},
						{
							origin: "http://localhost:4321",
							template: "http://localhost:4321/reset-account-password?token={token}",
						},
					]),
		],
	},
};

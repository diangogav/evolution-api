import { FailOpenRevokedSessions } from "../../modules/auth/application/FailOpenRevokedSessions";
import { RevokeSessions } from "../../modules/auth/application/RevokeSessions";
import { SessionTokens } from "../../modules/auth/application/SessionTokens";
import { BunRedisRevokedSessions } from "../../modules/auth/infrastructure/BunRedisRevokedSessions";
import { RefreshTokenPostgresRepository } from "../../modules/auth/infrastructure/RefreshTokenPostgresRepository";
import { config } from "../../config";
import { Pino } from "../../shared/logger/infrastructure/Pino";
import { redisClient } from "../../shared/redis/redisClient";
import { apiJwt } from "../auth/apiJwt";

const SECONDS_PER_UNIT = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** `JWT_EXPIRES_IN` in seconds; config already checked it is a number and one of s, m, h, d. */
function jwtLifetimeSeconds(expiresIn: unknown): number {
	const match = /^(\d+)([smhd])$/.exec(String(expiresIn));
	if (!match) throw new Error(`Unexpected JWT lifetime: ${String(expiresIn)}`);
	return Number(match[1]) * SECONDS_PER_UNIT[match[2] as keyof typeof SECONDS_PER_UNIT];
}

// One store and one issuer for every router that starts, renews or ends a session.
export const refreshTokenRepository = new RefreshTokenPostgresRepository();
export const sessionTokens = new SessionTokens(refreshTokenRepository, apiJwt);
// Redis being down must not take every authenticated route with it; see FailOpenRevokedSessions.
export const revokedSessions = new FailOpenRevokedSessions(
	new BunRedisRevokedSessions(redisClient, jwtLifetimeSeconds(config.jwt.expiresIn)),
	new Pino(),
);
export const revokeSessions = new RevokeSessions(refreshTokenRepository, revokedSessions);

import { SessionTokens } from "../../modules/auth/application/SessionTokens";
import { RefreshTokenPostgresRepository } from "../../modules/auth/infrastructure/RefreshTokenPostgresRepository";
import { apiJwt } from "../auth/apiJwt";

// One store and one issuer for every router that starts or renews a session.
export const refreshTokenRepository = new RefreshTokenPostgresRepository();
export const sessionTokens = new SessionTokens(refreshTokenRepository, apiJwt);

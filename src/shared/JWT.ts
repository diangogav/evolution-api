import jwt, { JwtPayload } from "jsonwebtoken";

import { AuthenticationError } from "./errors/AuthenticationError";

export class JWT {
	constructor(
		private readonly config: {
			issuer: string;
			secret: string;
			expiresIn?: jwt.SignOptions["expiresIn"];
		},
	) {}

	generate(payload: { [key: string]: unknown }, options?: jwt.SignOptions): string {
		const jwtOptions: jwt.SignOptions = {
			issuer: this.config.issuer,
			expiresIn: this.config.expiresIn ?? "24h",
			...options,
		};

		return jwt.sign(payload, this.config.secret, jwtOptions);
	}

	/**
	 * Signs a fresh token with the claims of a valid one plus `claims`. The registered
	 * claims (iat, exp, iss) are issued again, so the new token lives a full lifetime.
	 */
	reissue(token: string, claims: { [key: string]: unknown }): string {
		const decoded = this.decode(token);
		const payload = typeof decoded === "string" ? {} : decoded;
		const { iat: _iat, exp: _exp, iss: _iss, nbf: _nbf, ...custom } = payload;

		return this.generate({ ...custom, ...claims });
	}

	decode(token: string): string | JwtPayload {
		try {
			return jwt.verify(token, this.config.secret, {
				issuer: this.config.issuer,
				// Also bounds legacy tokens that were created before `exp` was added.
				maxAge: this.config.expiresIn ?? "24h",
			});
		} catch (_error) {
			throw new AuthenticationError(`Invalid token. ${_error}`);
		}
	}
}

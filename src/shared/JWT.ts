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

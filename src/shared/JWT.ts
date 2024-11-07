import jwt, { JwtPayload } from "jsonwebtoken";

import { AuthenticationError } from "./errors/AuthenticationError";

export class JWT {
	constructor(private readonly config: { issuer: string; secret: string }) {}

	generate(payload: { [key: string]: unknown }): string {
		const options = {
			issuer: this.config.issuer,
		};

		return jwt.sign(payload, this.config.secret, options);
	}

	decode(token: string): string | JwtPayload {
		try {
			return jwt.verify(token, this.config.secret, { issuer: this.config.issuer });
		} catch (_error) {
			throw new AuthenticationError(`Invalid token.`);
		}
	}
}

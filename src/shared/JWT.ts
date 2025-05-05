import jwt, { JwtPayload } from "jsonwebtoken";

import { AuthenticationError } from "./errors/AuthenticationError";

export class JWT {
	constructor(private readonly config: { issuer: string; secret: string }) {}

	generate(payload: { [key: string]: unknown }, options?: jwt.SignOptions): string {
		const jwtOptions = {
			issuer: this.config.issuer,
			...options,
		};

		return jwt.sign(payload, this.config.secret, jwtOptions);
	}

	decode(token: string): string | JwtPayload {
		try {
			return jwt.verify(token, this.config.secret, { issuer: this.config.issuer });
		} catch (_error) {
			throw new AuthenticationError(`Invalid token. ${_error}`);
		}
	}
}

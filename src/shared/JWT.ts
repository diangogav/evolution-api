import jwt, { JwtPayload } from "jsonwebtoken";

import { config } from "../config";

import { AuthenticationError } from "./errors/AuthenticationError";

export class JWT {
	generate(payload: { [key: string]: unknown }): string {
		const options = {
			issuer: config.jwt.issuer,
		};

		return jwt.sign(payload, config.jwt.secret, options);
	}

	decode(token: string): string | JwtPayload {
		try {
			return jwt.verify(token, config.jwt.secret, { issuer: config.jwt.issuer });
		} catch (_error) {
			throw new AuthenticationError(`Invalid token.`);
		}
	}
}

import jwt from "jsonwebtoken";

import { config } from "../config";

export class JWT {
	generate(payload: { [key: string]: unknown }): string {
		const options = {
			issuer: config.jwt.issuer,
		};

		return jwt.sign(payload, config.jwt.secret, options);
	}
}

import { describe, expect, it } from "bun:test";
import jwt from "jsonwebtoken";

import { JWT } from "../../../src/shared/JWT";

describe("JWT", () => {
	const secret = "test-secret";
	const issuer = "evolution-test";

	it("adds an expiration to newly generated access tokens", () => {
		const service = new JWT({ issuer, secret, expiresIn: "24h" });
		const token = service.generate({ id: "user-id" });
		const payload = jwt.decode(token);

		if (!payload || typeof payload === "string") throw new Error("Expected a JWT payload");
		expect(typeof payload).toBe("object");
		expect(payload.exp).toBeNumber();
		expect(payload.iat).toBeNumber();
		expect(payload.exp! - payload.iat!).toBe(24 * 60 * 60);
	});

	it("rejects expired tokens", () => {
		const service = new JWT({ issuer, secret, expiresIn: "24h" });
		const token = service.generate({ id: "user-id" }, { expiresIn: -1 });

		expect(() => service.decode(token)).toThrow("Invalid token");
	});

	it("bounds legacy tokens that do not contain exp", () => {
		const service = new JWT({ issuer, secret, expiresIn: "24h" });
		const issuedTwoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
		const legacyToken = jwt.sign({ id: "user-id", iat: issuedTwoDaysAgo }, secret, {
			issuer,
		});
		const legacyPayload = jwt.decode(legacyToken);

		if (!legacyPayload || typeof legacyPayload === "string") {
			throw new Error("Expected a legacy JWT payload");
		}
		expect(legacyPayload.exp).toBeUndefined();
		expect(legacyPayload.iat).toBe(issuedTwoDaysAgo);
		expect(() => service.decode(legacyToken)).toThrow("Invalid token");
	});

	it("allows a shorter purpose-specific expiration", () => {
		const service = new JWT({ issuer, secret, expiresIn: "24h" });
		const token = service.generate({ id: "user-id" }, { expiresIn: "1h" });
		const payload = jwt.decode(token);

		if (!payload || typeof payload === "string") throw new Error("Expected a JWT payload");
		expect(payload.exp! - payload.iat!).toBe(60 * 60);
	});
});

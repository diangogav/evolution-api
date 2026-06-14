import { describe, expect, it } from "bun:test";

import { ResetPasswordLinkBuilder } from "../../../../../src/modules/user/domain/ResetPasswordLinkBuilder";

describe("ResetPasswordLinkBuilder", () => {
	const builder = new ResetPasswordLinkBuilder(
		[
			{ origin: "https://evolutionygo.com", template: "https://evolutionygo.com/reset-password?token={token}" },
			{ origin: "https://evoduel.com", template: "https://evoduel.com/#/reset-account-password?token={token}" },
		],
		"https://evolutionygo.com/reset-password?token={token}",
	);

	it("builds the link for a known origin header", () => {
		const link = builder.build({ origin: "https://evoduel.com", referer: null, token: "abc" });

		expect(link).toBe("https://evoduel.com/#/reset-account-password?token=abc");
	});

	it("derives the origin from the referer when the origin header is absent", () => {
		const link = builder.build({ origin: null, referer: "https://evolutionygo.com/", token: "abc" });

		expect(link).toBe("https://evolutionygo.com/reset-password?token=abc");
	});

	it("prefers the origin header over the referer", () => {
		const link = builder.build({ origin: "https://evoduel.com", referer: "https://evolutionygo.com/", token: "abc" });

		expect(link).toBe("https://evoduel.com/#/reset-account-password?token=abc");
	});

	it("falls back to the default template for an unknown origin", () => {
		const link = builder.build({ origin: "https://evil.com", referer: null, token: "abc" });

		expect(link).toBe("https://evolutionygo.com/reset-password?token=abc");
	});

	it("falls back to the default when neither origin nor referer are present", () => {
		const link = builder.build({ origin: null, referer: null, token: "abc" });

		expect(link).toBe("https://evolutionygo.com/reset-password?token=abc");
	});

	it("falls back to the default when the referer is malformed", () => {
		const link = builder.build({ origin: null, referer: "not-a-url", token: "abc" });

		expect(link).toBe("https://evolutionygo.com/reset-password?token=abc");
	});

	it("matches the origin ignoring trailing slash and case", () => {
		const link = builder.build({ origin: "https://EVODUEL.com/", referer: null, token: "abc" });

		expect(link).toBe("https://evoduel.com/#/reset-account-password?token=abc");
	});
});

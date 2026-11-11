import { describe, expect, it } from "bun:test";

import { parsePushConfig } from "../../../src/config";

const complete = {
	VAPID_PUBLIC_KEY: "BPUBLIC",
	VAPID_PRIVATE_KEY: "private",
	VAPID_SUBJECT: "mailto:ops@example.com",
};

describe("parsePushConfig", () => {
	it("turns push on when the three variables are set", () => {
		expect(parsePushConfig(complete)).toEqual({
			vapidPublicKey: "BPUBLIC",
			vapidPrivateKey: "private",
			vapidSubject: "mailto:ops@example.com",
		});
		expect(parsePushConfig({ ...complete, VAPID_SUBJECT: "https://example.com" })).not.toBeNull();
	});

	it("keeps push off when any variable is missing or blank", () => {
		expect(parsePushConfig({})).toBeNull();
		expect(parsePushConfig({ ...complete, VAPID_PRIVATE_KEY: undefined })).toBeNull();
		expect(parsePushConfig({ ...complete, VAPID_PUBLIC_KEY: " " })).toBeNull();
	});

	it("rejects a subject that is neither mailto: nor https:", () => {
		expect(() => parsePushConfig({ ...complete, VAPID_SUBJECT: "ops@example.com" })).toThrow(
			"VAPID_SUBJECT",
		);
	});
});

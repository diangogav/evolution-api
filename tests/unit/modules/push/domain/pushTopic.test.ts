import { describe, expect, it } from "bun:test";

import { pushTopic } from "../../../../../src/modules/push/domain/pushTopic";

describe("pushTopic", () => {
	it("is 32 characters of the URL-safe base64 alphabet for any key", () => {
		for (const key of ["RSV0000000000001", "", "ñ/+= with spaces", "x".repeat(500)]) {
			expect(pushTopic("lightning-summons", key)).toMatch(/^[A-Za-z0-9_-]{32}$/);
		}
	});

	it("is stable for the same key and differs across keys and namespaces", () => {
		const topic = pushTopic("lightning-summons", "RSV0000000000001");

		expect(pushTopic("lightning-summons", "RSV0000000000001")).toBe(topic);
		expect(pushTopic("lightning-summons", "RSV0000000000002")).not.toBe(topic);
		expect(pushTopic("queue-match", "RSV0000000000001")).not.toBe(topic);
	});
});

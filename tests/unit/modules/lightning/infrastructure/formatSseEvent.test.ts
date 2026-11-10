import { describe, expect, it } from "bun:test";

import {
	formatSseComment,
	formatSseEvent,
} from "../../../../../src/modules/lightning/infrastructure/formatSseEvent";

describe("formatSseEvent", () => {
	it("writes the event name, the id and the data, ending with a blank line", () => {
		expect(formatSseEvent({ event: "message", id: 42, data: '{"id":42}' })).toBe(
			'event: message\nid: 42\ndata: {"id":42}\n\n',
		);
	});

	it("leaves out the event and id lines when they are not given", () => {
		expect(formatSseEvent({ data: "{}" })).toBe("data: {}\n\n");
	});

	it("gives every line of multi-line data its own data field", () => {
		expect(formatSseEvent({ event: "x", data: "a\nb\r\nc\rd" })).toBe(
			"event: x\ndata: a\ndata: b\ndata: c\ndata: d\n\n",
		);
	});

	it("strips line breaks from the event name and the id so they cannot inject fields", () => {
		expect(formatSseEvent({ event: "a\ndata: x", id: "1\r\n2", data: "y" })).toBe(
			"event: adata: x\nid: 12\ndata: y\n\n",
		);
	});
});

describe("formatSseComment", () => {
	it("writes a single-line comment frame", () => {
		expect(formatSseComment("ping")).toBe(": ping\n\n");
		expect(formatSseComment("a\nb")).toBe(": ab\n\n");
	});
});

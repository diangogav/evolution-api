import { describe, expect, it } from "bun:test";

import {
	LIGHTNING_CHAT_BODY_MAX_LENGTH,
	newLightningChatMessage,
} from "../../../../../src/modules/lightning/domain/LightningChatMessage";
import { UnprocessableError } from "../../../../../src/shared/errors/UnprocessableError";

const draft = (body: string) =>
	newLightningChatMessage({ tournamentId: "t-1", userId: "u-1", body });

describe("newLightningChatMessage", () => {
	it("keeps the author and tournament and trims the body", () => {
		expect(draft("  good luck all  ")).toEqual({
			tournamentId: "t-1",
			userId: "u-1",
			body: "good luck all",
		});
	});

	it.each(["", "   ", "　"])("rejects a body that is empty after trimming (%j)", (body) => {
		expect(() => draft(body)).toThrow(UnprocessableError);
	});

	it("accepts exactly the maximum length and rejects one character more", () => {
		const longest = "a".repeat(LIGHTNING_CHAT_BODY_MAX_LENGTH);

		expect(draft(longest).body).toBe(longest);
		expect(() => draft(`${longest}a`)).toThrow(UnprocessableError);
	});

	it("counts characters as the database does, so astral symbols count once", () => {
		const emojis = "🃏".repeat(LIGHTNING_CHAT_BODY_MAX_LENGTH);

		expect(draft(emojis).body).toBe(emojis);
	});

	it.each([
		"line\nbreak",
		"tab\there",
		"bell\u0007",
		"null\u0000",
		"del\u007f",
		"c1\u0085",
	])("rejects control characters inside the body (%j)", (body) => {
		expect(() => draft(body)).toThrow(UnprocessableError);
	});

	it("rejects a body whose control characters sit in the trimmed edges", () => {
		expect(() => draft("hello\n")).toThrow(UnprocessableError);
	});
});

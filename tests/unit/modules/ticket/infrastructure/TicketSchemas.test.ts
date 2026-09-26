import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { IssueGameTicket } from "../../../../../src/modules/ticket/application/IssueGameTicket";
import { GameTicketSchema } from "../../../../../src/modules/ticket/infrastructure/TicketSchemas";

describe("GameTicketSchema", () => {
	it("accepts the ticket IssueGameTicket returns and rejects a missing ticket", async () => {
		const issued = await new IssueGameTicket({ save: async () => undefined }).issue({
			userId: "user-1",
		});

		expect(Value.Check(GameTicketSchema, issued)).toBe(true);
		expect(Value.Check(GameTicketSchema, {})).toBe(false);
	});
});

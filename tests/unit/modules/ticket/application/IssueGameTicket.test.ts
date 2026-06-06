import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { IssueGameTicket } from "../../../../../src/modules/ticket/application/IssueGameTicket";
import { GameTicket } from "../../../../../src/modules/ticket/domain/GameTicket";
import { RankedTicketRepository } from "../../../../../src/modules/ticket/domain/RankedTicketRepository";

describe("IssueGameTicket", () => {
	let repository: RankedTicketRepository;
	let issuer: IssueGameTicket;

	beforeEach(() => {
		repository = {
			save: async () => undefined,
		};
		issuer = new IssueGameTicket(repository);
	});

	it("issues a single-use ticket, persists it for the user and returns the ticket value", async () => {
		const saveSpy = spyOn(repository, "save");

		const result = await issuer.issue({ userId: "user-123" });

		expect(result.ticket).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
		expect(saveSpy).toHaveBeenCalledTimes(1);

		const [savedTicket, savedUserId] = saveSpy.mock.calls[0];
		expect(savedTicket).toBeInstanceOf(GameTicket);
		expect((savedTicket as GameTicket).value).toBe(result.ticket);
		expect(savedUserId).toBe("user-123");
	});

	it("issues a unique ticket on every call", async () => {
		const first = await issuer.issue({ userId: "user-123" });
		const second = await issuer.issue({ userId: "user-123" });

		expect(first.ticket).not.toBe(second.ticket);
	});
});

import { describe, expect, it } from "bun:test";

import { ListAdminEvents } from "../../../../../src/modules/event-stats/application/ListAdminEvents";
import { eventDefinition } from "./fixtures";

describe("ListAdminEvents", () => {
	it("lists every catalog event newest first with its localized name", async () => {
		const listAdminEvents = new ListAdminEvents({
			list: async () => [
				eventDefinition({
					id: "old",
					name: { en: "Old" },
					startsAt: new Date("2026-01-01T00:00:00Z"),
				}),
				eventDefinition({ id: "halloween-2026" }),
			],
		});

		expect(await listAdminEvents.run()).toEqual([
			{
				id: "halloween-2026",
				name: "Halloween",
				startsAt: "2026-10-28T00:00:00.000Z",
				endsAt: "2026-11-08T00:00:00.000Z",
				waves: 1,
			},
			{
				id: "old",
				name: "Old",
				startsAt: "2026-01-01T00:00:00.000Z",
				endsAt: "2026-11-08T00:00:00.000Z",
				waves: 1,
			},
		]);
	});

	it("answers an empty list when the catalog has no events", async () => {
		expect(await new ListAdminEvents({ list: async () => [] }).run()).toEqual([]);
	});
});

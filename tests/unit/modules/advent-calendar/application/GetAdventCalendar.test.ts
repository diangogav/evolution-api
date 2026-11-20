import { beforeEach, describe, expect, it } from "bun:test";

import { GetAdventCalendar } from "../../../../../src/modules/advent-calendar/application/GetAdventCalendar";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { CALENDAR_ID, decided, NOW, TODAY, USER, World } from "./fakes";

let world: World;
let useCase: GetAdventCalendar;

const get = (now = NOW, locale: "en" | "es" = "en") =>
	useCase.run({ userId: USER, calendarId: CALENDAR_ID, locale, now });

beforeEach(() => {
	world = new World();
	useCase = new GetAdventCalendar(
		world.catalog,
		world.doorRepository,
		world.applyDuel,
		world.transactions,
	);
});

describe("GetAdventCalendar", () => {
	it("describes the calendar and every door as the player stands today", async () => {
		world.seedDoor(1, { clearedAt: NOW, attempts: 1, dieRoll: 4 });
		world.seedDoor(2, { clearedAt: NOW, attempts: 3 });
		world.seedDoor(3, { recoveredAt: NOW });

		const view = await get();

		expect(view).toMatchObject({
			id: CALENDAR_ID,
			name: "Advent Village",
			open: true,
			today: TODAY,
			nextDoorAt: "2026-12-06T00:00:00.000Z",
			recoveryPrice: 50,
			sealsBroken: 2,
			decks: [
				{ id: "chaos", name: "Chaos" },
				{ id: "warrior", name: "Warrior" },
			],
		});
		expect(view.doors).toHaveLength(24);
		expect(view.doors.map((door) => door.status).slice(0, 6)).toEqual([
			"cleared",
			"cleared",
			"open",
			"missed",
			"open",
			"locked",
		]);
		expect(view.doors[0]).toEqual({
			day: 1,
			status: "cleared",
			botName: "Sentinel1",
			prize: { essence: 50, cosmeticIds: [] },
			attempts: 1,
			firstTry: true,
			recovered: false,
			dieRoll: 4,
			dieBonus: { essence: 40, cosmeticIds: [] },
			canRoll: false,
			duelLive: false,
		});
		expect(view.doors[1]).toMatchObject({ firstTry: false, dieRoll: null, canRoll: true });
	});

	it("localizes the texts", async () => {
		const view = await get(NOW, "es");
		expect(view.name).toBe("Aldea de Adviento");
		expect(view.decks[0].name).toBe("Caos");
	});

	it("applies a finished duel before answering", async () => {
		world.seedDoor(TODAY, { currentReservationId: "OLD" });
		world.record("OLD", decided(0));

		const view = await get();

		expect(view.doors[TODAY - 1]).toMatchObject({ status: "cleared", canRoll: true });
		expect(view.sealsBroken).toBe(1);
		expect(world.ledger).toHaveLength(1);
	});

	it("flags a door whose duel is being played", async () => {
		world.seedDoor(TODAY, { currentReservationId: "OLD" });
		world.record("OLD", { startedAt: NOW });

		const view = await get();

		expect(view.doors[TODAY - 1]).toMatchObject({ status: "open", duelLive: true });
	});

	it("shows every door locked before the calendar starts", async () => {
		const view = await get(new Date("2026-11-25T00:00:00Z"));
		expect(view.open).toBe(false);
		expect(view.today).toBe(0);
		expect(view.nextDoorAt).toBe("2026-12-01T00:00:00.000Z");
		expect(view.doors.every((door) => door.status === "locked")).toBe(true);
	});

	it("answers 404 for an unknown calendar", async () => {
		await expect(
			useCase.run({ userId: USER, calendarId: "nope", locale: "en", now: NOW }),
		).rejects.toThrow(NotFoundError);
	});
});

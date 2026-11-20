import { beforeEach, describe, expect, it } from "bun:test";

import { RequestDoorDuel } from "../../../../../src/modules/advent-calendar/application/RequestDoorDuel";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { UnprocessableError } from "../../../../../src/shared/errors/UnprocessableError";
import { CALENDAR_ID, decided, NOW, TODAY, USER, World } from "./fakes";

let world: World;
let useCase: RequestDoorDuel;

const request = (day: number, deckId = "chaos", now = NOW) =>
	useCase.run({ userId: USER, calendarId: CALENDAR_ID, day, deckId, now });

beforeEach(() => {
	world = new World();
	useCase = new RequestDoorDuel(
		world.catalog,
		world.doorRepository,
		world.duelRepository,
		world.store,
		world.applyDuel,
		world.transactions,
		world.nextReservationId,
	);
});

describe("RequestDoorDuel", () => {
	it("reserves today's door against its sentinel with the chosen deck locked exactly", async () => {
		const result = await request(TODAY);

		expect(result.duel).toEqual({
			reservationId: "RSV0000000000001",
			password: "rv#RSV0000000000001",
			day: TODAY,
			botName: "Sentinel5",
			deck: { main: [1, 2], extra: [3], side: [] },
		});
		const reservation = world.redis.get("RSV0000000000001");
		expect(reservation?.format).toBe("goat");
		expect(reservation?.options.deckLock).toBe("exact");
		expect(reservation?.participants).toEqual([
			{ seat: 0, kind: "user", userId: USER, requiredDeck: { main: [1, 2], extra: [3], side: [] } },
			{ seat: 1, kind: "windbot", botName: "Sentinel5" },
		]);
		expect(world.door(TODAY)?.currentReservationId).toBe("RSV0000000000001");
		expect(world.issued.get("RSV0000000000001")).toMatchObject({ day: TODAY, deckId: "chaos" });
		expect(result.door.status).toBe("open");
	});

	it("publishes the reservation only after its rows are written", async () => {
		await request(TODAY);
		expect(world.events).toEqual([`save:${TODAY}`, "issue:RSV0000000000001"]);
	});

	it("answers 404 for an unknown calendar or door", async () => {
		await expect(
			useCase.run({ userId: USER, calendarId: "nope", day: 1, deckId: "chaos", now: NOW }),
		).rejects.toThrow(NotFoundError);
		await expect(request(25)).rejects.toThrow(NotFoundError);
	});

	it("rejects an unknown deck, a closed calendar and a door whose day has not come", async () => {
		await expect(request(TODAY, "nope")).rejects.toThrow(UnprocessableError);
		await expect(request(TODAY, "chaos", new Date("2027-01-01T00:00:00Z"))).rejects.toThrow(
			UnprocessableError,
		);
		await expect(request(TODAY + 1)).rejects.toThrow(UnprocessableError);
		expect(world.redis.size).toBe(0);
	});

	it("rejects a missed door until it is recovered", async () => {
		await expect(request(3)).rejects.toThrow(UnprocessableError);

		world.seedDoor(3, { recoveredAt: NOW });
		const result = await request(3);
		expect(result.duel?.botName).toBe("Sentinel3");
	});

	it("asks for recovery of the last door too once its day has passed", async () => {
		const afterLastDay = new Date("2026-12-28T12:00:00Z");
		await expect(request(24, "chaos", afterLastDay)).rejects.toThrow(UnprocessableError);

		world.seedDoor(24, { recoveredAt: afterLastDay });
		expect((await request(24, "chaos", afterLastDay)).duel?.botName).toBe("Sentinel24");
	});

	it("applies a pending win first: the door is cleared, its prize paid, and no duel is issued", async () => {
		world.seedDoor(TODAY, { currentReservationId: "OLD" });
		world.record("OLD", decided(0));

		const result = await request(TODAY);

		expect(result.duel).toBeNull();
		expect(result.door.status).toBe("cleared");
		expect(result.door.firstTry).toBe(true);
		expect(world.ledger).toEqual([
			{
				userId: USER,
				kind: "advent_calendar",
				referenceKey: "advent:advent-2026:door:5",
				delta: 50,
			},
		]);
		expect(world.granted.map((g) => g.cosmeticId)).toEqual(["sleeve-frost"]);
		expect(world.redis.size).toBe(0);
	});

	it("lets a lost door be retried, with the loss counted", async () => {
		world.seedDoor(TODAY, { currentReservationId: "OLD" });
		world.record("OLD", decided(1));

		const result = await request(TODAY);

		expect(result.duel?.reservationId).toBe("RSV0000000000001");
		expect(result.door.attempts).toBe(1);
		expect(world.ledger).toEqual([]);
	});

	it("answers 409 while the door's duel is live", async () => {
		world.seedDoor(TODAY, { currentReservationId: "OLD" });
		world.record("OLD", { startedAt: NOW });
		await expect(request(TODAY)).rejects.toThrow(ConflictError);
	});

	it("answers 409 when the server already claimed the previous reservation", async () => {
		await request(TODAY);
		world.claim("RSV0000000000001");
		await expect(request(TODAY)).rejects.toThrow(ConflictError);
	});

	it("replaces a reservation nobody claimed", async () => {
		await request(TODAY);
		const result = await request(TODAY, "warrior");

		expect(result.duel?.reservationId).toBe("RSV0000000000002");
		expect([...world.redis.keys()]).toEqual(["RSV0000000000002"]);
		expect(world.door(TODAY)?.attempts).toBe(0);
	});

	it("issues nothing for a door already cleared", async () => {
		world.seedDoor(TODAY, { clearedAt: NOW, attempts: 1 });
		const result = await request(TODAY);
		expect(result.duel).toBeNull();
		expect(world.redis.size).toBe(0);
	});

	it("pays a door's prize once even when its result is applied twice", async () => {
		world.seedDoor(TODAY, { currentReservationId: "OLD" });
		world.record("OLD", decided(0));
		await request(TODAY);
		// A retry that still sees the pointer, as after a crash between the two writes.
		world.seedDoor(TODAY, { currentReservationId: "OLD" });
		await request(TODAY);

		expect(world.ledger).toHaveLength(1);
		expect(world.door(TODAY)?.currentReservationId).not.toBe("OLD");
	});

	it("does not let a retired cosmetic block the door", async () => {
		world.activeCosmetics.clear();
		world.seedDoor(TODAY, { currentReservationId: "OLD" });
		world.record("OLD", decided(0));

		const result = await request(TODAY);

		expect(result.door.status).toBe("cleared");
		expect(world.ledger).toHaveLength(1);
	});

	it("still clears a door whose duel was won on its day but read the day after", async () => {
		world.seedDoor(4, { currentReservationId: "OLD" });
		world.record("OLD", decided(0, new Date("2026-12-04T23:50:00Z")));

		const result = await request(4);

		expect(result.door.status).toBe("cleared");
		expect(result.duel).toBeNull();
	});
});

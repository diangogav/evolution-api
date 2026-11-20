import { beforeEach, describe, expect, it } from "bun:test";

import { RecoverDoor } from "../../../../../src/modules/advent-calendar/application/RecoverDoor";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { PaymentRequiredError } from "../../../../../src/shared/errors/PaymentRequiredError";
import { UnprocessableError } from "../../../../../src/shared/errors/UnprocessableError";
import { CALENDAR_ID, NOW, TODAY, USER, World } from "./fakes";

let world: World;
let useCase: RecoverDoor;

const recover = (day: number, now = NOW) =>
	useCase.run({ userId: USER, calendarId: CALENDAR_ID, day, now });

beforeEach(() => {
	world = new World();
	useCase = new RecoverDoor(
		world.catalog,
		world.doorRepository,
		world.applyDuel,
		world.ledgerRepository,
		world.transactions,
	);
});

describe("RecoverDoor", () => {
	it("reopens a missed door for the calendar's price", async () => {
		world.credit(120);

		const result = await recover(3);

		expect(result.balance).toBe(70);
		expect(result.door.status).toBe("open");
		expect(result.door.recovered).toBe(true);
		expect(world.door(3)?.recoveredAt).toEqual(NOW);
		expect(world.ledger[world.ledger.length - 1]).toEqual({
			userId: USER,
			kind: "advent_calendar",
			referenceKey: "advent:advent-2026:recover:3",
			delta: -50,
		});
	});

	it("reads the balance under the user's ledger lock", async () => {
		world.credit(50);
		await recover(3);
		expect(world.events[0]).toBe(`lock:${USER}`);
	});

	it("answers 402 without enough essence and changes nothing", async () => {
		world.credit(49);

		await expect(recover(3)).rejects.toThrow(PaymentRequiredError);

		expect(world.balance()).toBe(49);
		expect(world.door(3)?.recoveredAt ?? null).toBeNull();
	});

	it("answers 409 for a door that is not missed", async () => {
		world.credit(500);
		world.seedDoor(2, { clearedAt: NOW, attempts: 1 });
		world.seedDoor(1, { recoveredAt: NOW });

		await expect(recover(TODAY)).rejects.toThrow(ConflictError);
		await expect(recover(TODAY + 1)).rejects.toThrow(ConflictError);
		await expect(recover(2)).rejects.toThrow(ConflictError);
		await expect(recover(1)).rejects.toThrow(ConflictError);
		expect(world.balance()).toBe(500);
	});

	it("answers 409 while the door's duel is live, so a win in progress is never charged for", async () => {
		world.credit(100);
		world.seedDoor(4, { currentReservationId: "OLD" });
		world.record("OLD", { startedAt: new Date("2026-12-04T23:58:00Z") });

		await expect(recover(4)).rejects.toThrow(ConflictError);

		expect(world.balance()).toBe(100);
		expect(world.door(4)?.recoveredAt ?? null).toBeNull();
	});

	it("rejects a closed calendar and unknown doors", async () => {
		world.credit(500);
		await expect(recover(3, new Date("2027-01-01T00:00:00Z"))).rejects.toThrow(UnprocessableError);
		await expect(recover(25)).rejects.toThrow(NotFoundError);
		await expect(
			useCase.run({ userId: USER, calendarId: "nope", day: 3, now: NOW }),
		).rejects.toThrow(NotFoundError);
	});
});

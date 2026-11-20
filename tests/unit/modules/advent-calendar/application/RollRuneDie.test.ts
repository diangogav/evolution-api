import { beforeEach, describe, expect, it } from "bun:test";

import { RollRuneDie } from "../../../../../src/modules/advent-calendar/application/RollRuneDie";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { CALENDAR_ID, decided, NOW, TODAY, USER, World } from "./fakes";

let world: World;
let useCase: RollRuneDie;

const roll = (day: number) => useCase.run({ userId: USER, calendarId: CALENDAR_ID, day, now: NOW });

beforeEach(() => {
	world = new World();
	useCase = new RollRuneDie(
		world.catalog,
		world.doorRepository,
		world.applyDuel,
		world.payPrize,
		world.ledgerRepository,
		world.transactions,
		world.pick,
	);
});

describe("RollRuneDie", () => {
	it("rolls once for a cleared door, stores the face and pays its essence", async () => {
		world.seedDoor(TODAY, { clearedAt: NOW, attempts: 1 });
		world.pickIndex = 2;

		const result = await roll(TODAY);

		expect(result.roll).toBe(3);
		expect(result.bonus).toEqual({ essence: 30, cosmeticIds: [] });
		expect(result.balance).toBe(30);
		expect(world.door(TODAY)?.dieRoll).toBe(3);
		expect(world.ledger).toEqual([
			{
				userId: USER,
				kind: "advent_calendar",
				referenceKey: "advent:advent-2026:die:5",
				delta: 30,
			},
		]);
	});

	it("pays the rare prize on a 6", async () => {
		world.seedDoor(TODAY, { clearedAt: NOW, attempts: 1 });
		world.pickIndex = 5;

		const result = await roll(TODAY);

		expect(result.roll).toBe(6);
		expect(result.bonus).toEqual({ essence: 100, cosmeticIds: ["emote-rune"] });
		expect(world.granted.map((g) => g.cosmeticId)).toEqual(["emote-rune"]);
	});

	it("returns the stored roll when asked again and pays nothing more", async () => {
		world.seedDoor(TODAY, { clearedAt: NOW, attempts: 1 });
		world.pickIndex = 1;
		await roll(TODAY);
		world.pickIndex = 5;

		const again = await roll(TODAY);

		expect(again.roll).toBe(2);
		expect(again.bonus).toEqual({ essence: 20, cosmeticIds: [] });
		expect(world.ledger).toHaveLength(1);
		expect(world.granted).toEqual([]);
	});

	it("answers 409 for a door not cleared", async () => {
		await expect(roll(TODAY)).rejects.toThrow(ConflictError);
		world.seedDoor(3, { attempts: 2 });
		await expect(roll(3)).rejects.toThrow(ConflictError);
		expect(world.ledger).toEqual([]);
	});

	it("applies a pending win before rolling", async () => {
		world.seedDoor(TODAY, { currentReservationId: "OLD" });
		world.record("OLD", decided(0));

		const result = await roll(TODAY);

		expect(result.roll).toBe(1);
		expect(world.ledger.map((e) => e.referenceKey)).toEqual([
			"advent:advent-2026:door:5",
			"advent:advent-2026:die:5",
		]);
	});

	it("answers 404 for an unknown calendar or door", async () => {
		await expect(
			useCase.run({ userId: USER, calendarId: "nope", day: 1, now: NOW }),
		).rejects.toThrow(NotFoundError);
		await expect(roll(0)).rejects.toThrow(NotFoundError);
	});
});

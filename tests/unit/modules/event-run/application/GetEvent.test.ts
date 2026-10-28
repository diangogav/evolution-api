import { describe, expect, it } from "bun:test";

import { GetEvent } from "../../../../../src/modules/event-run/application/GetEvent";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { EVENT_ID, NOW, USER, World } from "./fakes";

describe("GetEvent", () => {
	it("returns the localized catalog with attempts left today and the best mark", async () => {
		const world = new World();
		world.attempts.set(`${USER}|${EVENT_ID}|2026-10-31`, 2);
		world.seedRun({ status: "lost", wavesCleared: 4 });
		world.seedRun({ status: "lost", wavesCleared: 2 });
		const useCase = new GetEvent(world.catalog, world.runRepository, world.attemptRepository);

		const view = await useCase.run({ userId: USER, eventId: EVENT_ID, locale: "es", now: NOW });

		expect(view).toMatchObject({
			id: EVENT_ID,
			name: "Horda Zombie",
			open: true,
			attemptsPerDay: 3,
			attemptsLeftToday: 1,
			bestMark: 4,
			decks: [{ id: "necromancer", name: "Nigromante" }],
		});
		expect(view.waves).toEqual([
			{ wave: 1, tier: "easy", pool: ["Haunted", "Skeletons", "Horde"] },
			{ wave: 2, tier: "easy", pool: ["Haunted", "Skeletons", "Horde"] },
			{ wave: 3, tier: "medium", pool: ["Archfiends", "Vampires", "Witches"] },
			{ wave: 4, tier: "medium", pool: ["Archfiends", "Vampires", "Witches"] },
			{ wave: 5, tier: "hard", pool: ["DarkWorld", "CursedGarden", "Necromancer"] },
			{ wave: 6, tier: "hard", pool: ["DarkWorld", "CursedGarden", "Necromancer"] },
			{ wave: 7, tier: "miniboss", pool: ["Lich"] },
			{ wave: 8, tier: "boss", pool: ["Gravekeepers"] },
		]);
	});

	it("answers 404 for an unknown event", async () => {
		const world = new World();
		const useCase = new GetEvent(world.catalog, world.runRepository, world.attemptRepository);

		await expect(
			useCase.run({ userId: USER, eventId: "nope", locale: "en", now: NOW }),
		).rejects.toThrow(NotFoundError);
	});
});

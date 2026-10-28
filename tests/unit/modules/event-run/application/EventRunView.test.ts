import { describe, expect, it } from "bun:test";

import { toEventRunView } from "../../../../../src/modules/event-run/application/EventRunView";
import { EventRun, startEventRun } from "../../../../../src/modules/event-run/domain/EventRun";
import { EVENT_ID, halloween, NOW, USER } from "./fakes";

function run(overrides: Partial<EventRun>): EventRun {
	return {
		...startEventRun({
			id: "run-1",
			userId: USER,
			eventId: EVENT_ID,
			deckId: "necromancer",
			now: NOW,
		}),
		...overrides,
	};
}

describe("toEventRunView", () => {
	it("names the rival a lost run fell to", () => {
		const view = toEventRunView(
			run({ status: "lost", currentWave: 4, wavesCleared: 3, currentBot: "Vampires" }),
			halloween(),
		);

		expect(view).toMatchObject({ status: "lost", botName: null, lostTo: "Vampires" });
	});

	it("has no lostTo while the run is ready, or once it was won or expired", () => {
		const ready = run({ currentBot: "Haunted" });
		const won = run({ status: "won", currentWave: 8, wavesCleared: 8, currentBot: null });
		const expired = run({ status: "expired", currentBot: "Skeletons" });

		for (const stored of [ready, won, expired]) {
			expect(toEventRunView(stored, halloween()).lostTo).toBeNull();
		}
	});
});

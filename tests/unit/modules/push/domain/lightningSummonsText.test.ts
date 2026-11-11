import { describe, expect, it } from "bun:test";

import { lightningSummonsText } from "../../../../../src/modules/push/domain/lightningSummonsText";

describe("lightningSummonsText", () => {
	it("names the tournament and the lobby wait in Spanish and English", () => {
		const input = { tournamentName: "Friday Lightning", lobbyTimeoutSeconds: 90 };

		expect(lightningSummonsText("es", input)).toEqual({
			title: "Tu duelo del torneo está listo",
			body: "Friday Lightning. Entra ahora: la sala espera 90 s",
		});
		expect(lightningSummonsText("en", input)).toEqual({
			title: "Your tournament duel is ready",
			body: "Friday Lightning. Join now: the room waits 90 s",
		});
	});

	it("drops the name prefix when the tournament has no name", () => {
		expect(lightningSummonsText("en", { tournamentName: " ", lobbyTimeoutSeconds: 60 }).body).toBe(
			"Join now: the room waits 60 s",
		);
	});
});

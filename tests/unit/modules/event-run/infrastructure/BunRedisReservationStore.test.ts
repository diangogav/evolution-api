import { describe, expect, it, mock } from "bun:test";
import type { RedisClient } from "bun";

import { eventDuelReservation } from "../../../../../src/modules/event-run/domain/DuelReservation";
import {
	BunRedisReservationStore,
	ReservationIdCollisionError,
	REVOKE_SCRIPT,
} from "../../../../../src/modules/event-run/infrastructure/BunRedisReservationStore";

function client(reply: unknown) {
	const send = mock(async (_command: string, _args: string[]) => reply);
	return { send, store: new BunRedisReservationStore({ send } as unknown as RedisClient) };
}

const reservation = eventDuelReservation({
	reservationId: "AbCdEfGh12345678",
	format: "edison",
	userId: "user-1",
	deck: { id: "d", name: { en: "D" }, main: [1], extra: [] },
	botName: "Haunted",
});

describe("BunRedisReservationStore", () => {
	it("issues with one SET … EX … NX on duel:reservation:<id>", async () => {
		const { send, store } = client("OK");

		await store.issue(reservation, 600);

		const [command, args] = send.mock.calls[0];
		expect(command).toBe("SET");
		expect(args[0]).toBe("duel:reservation:AbCdEfGh12345678");
		expect(JSON.parse(args[1])).toEqual(reservation);
		expect(args.slice(2)).toEqual(["EX", "600", "NX"]);
	});

	it("refuses to overwrite an existing key", async () => {
		const { store } = client(null);

		await expect(store.issue(reservation, 600)).rejects.toThrow(ReservationIdCollisionError);
	});

	it("revokes atomically with the Lua script and passes its reply through", async () => {
		for (const reply of ["revoked", "in_use", "gone"]) {
			const { send, store } = client(reply);

			expect(await store.revoke("AbCdEfGh12345678")).toBe(reply as never);
			expect(send.mock.calls[0]).toEqual([
				"EVAL",
				[REVOKE_SCRIPT, "1", "duel:reservation:AbCdEfGh12345678"],
			]);
		}
	});

	it("the script deletes only an unclaimed key", () => {
		expect(REVOKE_SCRIPT).toContain("return 'gone'");
		expect(REVOKE_SCRIPT).toContain("reservation.claim ~= cjson.null then return 'in_use'");
		expect(REVOKE_SCRIPT.indexOf("return 'in_use'")).toBeLessThan(REVOKE_SCRIPT.indexOf("DEL"));
	});

	it("fails loudly on an unexpected reply", async () => {
		const { store } = client("weird");

		await expect(store.revoke("AbCdEfGh12345678")).rejects.toThrow();
	});
});

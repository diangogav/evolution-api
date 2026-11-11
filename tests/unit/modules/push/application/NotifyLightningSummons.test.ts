import { describe, expect, it, mock } from "bun:test";

import {
	type LightningSummonsNotice,
	NotifyLightningSummons,
} from "../../../../../src/modules/push/application/NotifyLightningSummons";
import type {
	PushSender,
	PushSendOptions,
	PushSendOutcome,
} from "../../../../../src/modules/push/domain/PushSender";
import type { PushSubscription } from "../../../../../src/modules/push/domain/PushSubscription";
import type { PushSubscriptionRepository } from "../../../../../src/modules/push/domain/PushSubscriptionRepository";
import { pushTopic } from "../../../../../src/modules/push/domain/pushTopic";

const NOW = new Date("2026-11-13T20:30:00Z");

function logger() {
	return {
		debug: mock(() => undefined),
		info: mock(() => undefined),
		error: mock((_message: unknown) => undefined),
	};
}

function subscription(userId: string, n: number, locale: "en" | "es" = "en"): PushSubscription {
	return {
		userId,
		endpoint: `https://push.example.com/${userId}/${n}`,
		p256dh: "p256",
		auth: "auth",
		locale,
	};
}

class FakeRepository implements PushSubscriptionRepository {
	readonly listCalls: string[][] = [];
	readonly deleted: string[] = [];
	readonly touched: Array<{ endpoints: string[]; at: Date }> = [];
	failList = false;

	constructor(public rows: PushSubscription[]) {}

	async upsert() {
		throw new Error("not used");
	}
	async deleteByEndpointForUser() {
		throw new Error("not used");
	}
	async listByUsers(userIds: readonly string[]) {
		this.listCalls.push([...userIds]);
		if (this.failList) throw new Error("db down");
		return this.rows.filter((row) => userIds.includes(row.userId));
	}
	async deleteByEndpoint(endpoint: string) {
		this.deleted.push(endpoint);
	}
	async touch(endpoints: readonly string[], at: Date) {
		this.touched.push({ endpoints: [...endpoints], at });
	}
}

type Sent = { endpoint: string; payload: Record<string, unknown>; options: PushSendOptions };

class FakeSender implements PushSender {
	readonly sent: Sent[] = [];
	inFlight = 0;
	maxInFlight = 0;

	constructor(
		private readonly answer: (endpoint: string) => PushSendOutcome | Error = () => "sent",
	) {}

	async send(
		target: Pick<PushSubscription, "endpoint">,
		payload: string,
		options: PushSendOptions,
	): Promise<PushSendOutcome> {
		this.inFlight++;
		this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
		await new Promise((resolve) => setTimeout(resolve, 1));
		this.inFlight--;
		this.sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload), options });
		const outcome = this.answer(target.endpoint);
		if (outcome instanceof Error) throw outcome;
		return outcome;
	}
}

const notice = (reservationId: string, userIds: string[]): LightningSummonsNotice => ({
	tournamentId: "t-1",
	tournamentName: "Friday Lightning",
	reservationId,
	userIds,
	lobbyTimeoutSeconds: 90,
});

describe("NotifyLightningSummons", () => {
	it("loads every paired user's subscriptions in one query and sends to each of them", async () => {
		const repository = new FakeRepository([
			subscription("alice", 1),
			subscription("alice", 2),
			subscription("bob", 1),
			subscription("carol", 1),
		]);
		const sender = new FakeSender();

		await new NotifyLightningSummons(repository, sender, logger()).run(
			[notice("RSV1", ["alice", "bob"]), notice("RSV2", ["carol", "dave"])],
			NOW,
		);

		expect(repository.listCalls).toEqual([["alice", "bob", "carol", "dave"]]);
		expect(sender.sent.map((s) => s.endpoint).sort()).toEqual([
			"https://push.example.com/alice/1",
			"https://push.example.com/alice/2",
			"https://push.example.com/bob/1",
			"https://push.example.com/carol/1",
		]);
	});

	it("renders the text in each subscription's locale and links the tournament", async () => {
		const repository = new FakeRepository([
			subscription("alice", 1, "es"),
			subscription("bob", 1, "en"),
		]);
		const sender = new FakeSender();

		await new NotifyLightningSummons(repository, sender, logger()).run(
			[notice("RSV1", ["alice", "bob"])],
			NOW,
		);

		const byUser = new Map(sender.sent.map((s) => [s.endpoint.split("/")[3], s.payload]));
		expect(byUser.get("alice")).toEqual({
			type: "lightning-summons",
			tournamentId: "t-1",
			reservationId: "RSV1",
			title: "Tu duelo del torneo está listo",
			body: "Friday Lightning. Entra ahora: la sala espera 90 s",
			url: "/lightning/t-1",
		});
		expect(byUser.get("bob")).toMatchObject({
			title: "Your tournament duel is ready",
			body: "Friday Lightning. Join now: the room waits 90 s",
		});
	});

	it("sends with the lobby timeout as TTL, high urgency and the reservation's topic", async () => {
		const repository = new FakeRepository([subscription("alice", 1)]);
		const sender = new FakeSender();

		await new NotifyLightningSummons(repository, sender, logger()).run(
			[{ ...notice("RSV1", ["alice", "bob"]), lobbyTimeoutSeconds: 45 }],
			NOW,
		);

		expect(sender.sent[0].options).toEqual({
			ttlSeconds: 45,
			urgency: "high",
			topic: pushTopic("lightning-summons", "RSV1"),
		});
	});

	it("deletes gone subscriptions, stamps delivered ones and logs failures", async () => {
		const repository = new FakeRepository([
			subscription("alice", 1),
			subscription("alice", 2),
			subscription("bob", 1),
			subscription("bob", 2),
		]);
		const sender = new FakeSender((endpoint) => {
			if (endpoint.endsWith("alice/2")) return "gone";
			if (endpoint.endsWith("bob/2")) return "failed";
			if (endpoint.endsWith("bob/1")) return new Error("boom");
			return "sent";
		});
		const log = logger();

		await new NotifyLightningSummons(repository, sender, log).run(
			[notice("RSV1", ["alice", "bob"])],
			NOW,
		);

		expect(repository.deleted).toEqual(["https://push.example.com/alice/2"]);
		expect(repository.touched).toEqual([
			{ endpoints: ["https://push.example.com/alice/1"], at: NOW },
		]);
		expect(log.error).toHaveBeenCalledTimes(1);
		expect(String(log.error.mock.calls[0][0])).toContain("2 of 4");
	});

	it("never throws, even when the subscriptions cannot be read", async () => {
		const repository = new FakeRepository([]);
		repository.failList = true;
		const log = logger();

		await expect(
			new NotifyLightningSummons(repository, new FakeSender(), log).run(
				[notice("RSV1", ["alice", "bob"])],
				NOW,
			),
		).resolves.toBeUndefined();
		expect(String(log.error.mock.calls[0][0])).toContain("db down");
	});

	it("never throws when cleaning up after the sends fails", async () => {
		const repository = new FakeRepository([subscription("alice", 1), subscription("bob", 1)]);
		repository.deleteByEndpoint = async () => {
			throw new Error("delete failed");
		};
		repository.touch = async () => {
			throw new Error("touch failed");
		};
		const sender = new FakeSender((endpoint) => (endpoint.includes("alice") ? "gone" : "sent"));
		const log = logger();

		await new NotifyLightningSummons(repository, sender, log).run(
			[notice("RSV1", ["alice", "bob"])],
			NOW,
		);

		expect(log.error).toHaveBeenCalledTimes(2);
	});

	it("keeps at most the configured number of sends in flight", async () => {
		const rows = Array.from({ length: 20 }, (_, n) => subscription(`user-${n}`, 1));
		const repository = new FakeRepository(rows);
		const sender = new FakeSender();

		await new NotifyLightningSummons(repository, sender, logger(), 3).run(
			[
				notice(
					"RSV1",
					rows.map((row) => row.userId),
				),
			],
			NOW,
		);

		expect(sender.sent).toHaveLength(20);
		expect(sender.maxInFlight).toBe(3);
	});

	it("does nothing without summons or without subscriptions", async () => {
		const repository = new FakeRepository([]);
		const sender = new FakeSender();
		const notifier = new NotifyLightningSummons(repository, sender, logger());

		await notifier.run([], NOW);
		expect(repository.listCalls).toEqual([]);

		await notifier.run([notice("RSV1", ["alice", "bob"])], NOW);
		expect(sender.sent).toEqual([]);
		expect(repository.touched).toEqual([]);
	});
});

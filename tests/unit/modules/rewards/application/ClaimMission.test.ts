import { describe, expect, it } from "bun:test";

import { ClaimMission } from "../../../../../src/modules/rewards/application/ClaimMission";
import { EssenceLedgerEntry } from "../../../../../src/modules/rewards/domain/EssenceLedgerEntry";
import {
	EssenceLedgerRepository,
	QueryableManager,
} from "../../../../../src/modules/rewards/domain/EssenceLedgerRepository";
import { Mission } from "../../../../../src/modules/rewards/domain/Mission";
import { MissionCatalogRepository } from "../../../../../src/modules/rewards/domain/MissionCatalogRepository";
import { MissionClaimRepository } from "../../../../../src/modules/rewards/domain/MissionClaimRepository";
import { RewardsProjectionRepository } from "../../../../../src/modules/rewards/domain/RewardsProjectionRepository";
import { TransactionRunner } from "../../../../../src/modules/rewards/domain/TransactionRunner";
import { selectDailyMissions } from "../../../../../src/modules/rewards/domain/selectDailyMissions";
import { EntitlementSource } from "../../../../../src/modules/entitlements/domain/EntitlementSource";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { UnprocessableError } from "../../../../../src/shared/errors/UnprocessableError";

function mission(
	code: string,
	reward: Mission["reward"],
	period: Mission["period"] = "daily",
): Mission {
	return {
		id: `id-${code}`,
		code,
		name: { en: code },
		description: { en: code },
		period,
		rule: { metric: "duelsPlayed", target: 3 },
		reward,
		active: true,
		sortOrder: 0,
	};
}

const essence20 = { type: "essence", amount: 20 } as const;
const catalog = [
	mission("play_3", essence20),
	mission("win_1", essence20),
	mission("ranked_play_1", essence20),
	mission("win_other_format", essence20),
	mission("win_fast", essence20),
	mission("weekly_play_20", { type: "essence", amount: 100 }, "weekly"),
	mission("event_sleeve", { type: "cosmetic", cosmeticId: "sleeve-1" }, "weekly"),
];

const now = new Date("2026-10-23T10:00:00Z");
const today = "2026-10-23";
const todays = selectDailyMissions(catalog, today);

class Fakes {
	completed = new Set<string>();
	claims = new Set<string>();
	ledger: EssenceLedgerEntry[] = [];
	granted: Array<{ userId: string; cosmeticId: string; source: EntitlementSource }> = [];
	balance = 0;

	readonly catalog: MissionCatalogRepository = { findActive: async () => catalog };
	readonly projection = {
		loadProgress: async (_u: string, pairs: Array<{ missionId: string; periodKey: string }>) =>
			pairs
				.filter((p) => this.completed.has(`${p.missionId}|${p.periodKey}`))
				.map((p) => ({ ...p, value: 3, completed: true })),
	} as unknown as RewardsProjectionRepository;
	events: string[] = [];
	readonly claimRepository: MissionClaimRepository = {
		lockUserPeriod: async (_u, periodKey) => {
			this.events.push(`lock:${periodKey}`);
		},
		findClaimedMissionIds: async (_u, ids, periodKey) =>
			ids.filter((id) => this.claims.has(`${id}|${periodKey}`)),
		insert: async (_u, missionId, periodKey) => {
			this.events.push("insert");
			const key = `${missionId}|${periodKey}`;
			if (this.claims.has(key)) return "skipped";
			this.claims.add(key);
			return "inserted";
		},
		countClaims: async (_u, ids, periodKey) =>
			ids.filter((id) => this.claims.has(`${id}|${periodKey}`)).length,
	};
	readonly ledgerRepository: EssenceLedgerRepository = {
		append: async (entry) => {
			this.ledger.push(entry);
			this.balance += entry.delta;
			return "inserted";
		},
		balanceOf: async () => this.balance,
	};
	readonly grant = {
		runForUserId: async (input: {
			userId: string;
			cosmeticId: string;
			source: EntitlementSource;
		}) => {
			this.granted.push(input);
			return { created: true };
		},
	};
	readonly transactions: TransactionRunner = {
		run: async <T>(work: (m: QueryableManager) => Promise<T>) => work({ query: async () => [] }),
	};

	useCase() {
		return new ClaimMission(
			this.catalog,
			this.projection,
			this.claimRepository,
			this.ledgerRepository,
			this.grant as never,
			this.transactions,
		);
	}
}

describe("ClaimMission", () => {
	it("pays an essence reward once and returns the new balance", async () => {
		const fakes = new Fakes();
		const target = todays[0];
		fakes.completed.add(`${target.id}|${today}`);

		const result = await fakes.useCase().run({ userId: "user-1", code: target.code, now });

		expect(result).toEqual({ balance: 20, reward: essence20 });
		expect(fakes.ledger).toEqual([
			{ userId: "user-1", kind: "mission", referenceKey: `${target.code}:${today}`, delta: 20 },
		]);
	});

	it("takes the user's period lock before inserting, so concurrent claims of different missions count the bonus serially", async () => {
		const fakes = new Fakes();
		const target = todays[0];
		fakes.completed.add(`${target.id}|${today}`);

		await fakes.useCase().run({ userId: "user-1", code: target.code, now });

		expect(fakes.events).toEqual([`lock:${today}`, "insert"]);
	});

	it("rejects a second claim of the same mission and period with 409", async () => {
		const fakes = new Fakes();
		const target = todays[0];
		fakes.completed.add(`${target.id}|${today}`);
		await fakes.useCase().run({ userId: "user-1", code: target.code, now });

		const second = fakes.useCase().run({ userId: "user-1", code: target.code, now });

		await expect(second).rejects.toThrow(new ConflictError("Mission already claimed"));
		expect(fakes.ledger).toHaveLength(1);
	});

	it("rejects a mission that is not completed in the current period with 422", async () => {
		const fakes = new Fakes();

		const claim = fakes.useCase().run({ userId: "user-1", code: todays[0].code, now });

		await expect(claim).rejects.toThrow(new UnprocessableError("Mission not completed"));
		expect(fakes.ledger).toHaveLength(0);
	});

	it("rejects an unknown code and a daily mission not selected for today with 404", async () => {
		const fakes = new Fakes();
		const notToday = catalog.find(
			(m) => m.period === "daily" && !todays.some((t) => t.id === m.id),
		) as Mission;
		fakes.completed.add(`${notToday.id}|${today}`);

		await expect(fakes.useCase().run({ userId: "user-1", code: "nope", now })).rejects.toThrow(
			NotFoundError,
		);
		await expect(
			fakes.useCase().run({ userId: "user-1", code: notToday.code, now }),
		).rejects.toThrow(NotFoundError);
	});

	it("credits the daily bonus with the third daily claim of the day", async () => {
		const fakes = new Fakes();
		for (const m of todays) fakes.completed.add(`${m.id}|${today}`);

		await fakes.useCase().run({ userId: "user-1", code: todays[0].code, now });
		await fakes.useCase().run({ userId: "user-1", code: todays[1].code, now });
		const third = await fakes.useCase().run({ userId: "user-1", code: todays[2].code, now });

		expect(third.balance).toBe(90);
		expect(fakes.ledger[fakes.ledger.length - 1]).toEqual({
			userId: "user-1",
			kind: "daily_bonus",
			referenceKey: today,
			delta: 30,
		});
	});

	it("grants a cosmetic reward through the entitlement grant and writes no ledger row", async () => {
		const fakes = new Fakes();
		fakes.completed.add("id-event_sleeve|2026-W43");

		const result = await fakes.useCase().run({ userId: "user-1", code: "event_sleeve", now });

		expect(result).toEqual({ balance: 0, reward: { type: "cosmetic", cosmeticId: "sleeve-1" } });
		expect(fakes.granted).toEqual([
			{ userId: "user-1", cosmeticId: "sleeve-1", source: EntitlementSource.CAMPAIGN },
		]);
		expect(fakes.ledger).toHaveLength(0);
	});
});

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { DAILY_OPPONENT_CAP } from "../../../../src/modules/tiers/domain/TierCatalog";
import { RankedTierCatalogSchema } from "../../../../src/modules/tiers/infrastructure/TierSchemas";
import { rankedTiersRouter } from "../../../../src/server/routes/ranked-tiers-router";

const LADDER_IDS = ["rookie", "bronze", "silver", "gold", "platinum", "diamond", "master"];

// The router is a module-level const over static data, so it is exercised
// directly. No request below carries an Authorization header: the catalog is
// public, and a 200 without credentials is the proof.
const get = (path: string) => rankedTiersRouter.handle(new Request(`http://localhost${path}`));

describe("GET /ranked-tiers", () => {
	it("serves the default ladder wrapper unauthenticated, with the seven tiers in ladder order", async () => {
		const response = await get("/ranked-tiers");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");
		expect(body.banListName).toBeNull();
		expect(body.dailyOpponentCap).toBe(DAILY_OPPONENT_CAP);
		expect(body.dayBoundary).toBe("UTC");
		expect(body.tiers).toHaveLength(7);
		expect(body.tiers.map((tier: { id: string }) => tier.id)).toEqual(LADDER_IDS);
		expect(body.tiers[3]).toMatchObject({
			id: "gold",
			name: "Gold",
			threshold: 10,
			kind: "absolute",
		});
		expect(Value.Check(RankedTierCatalogSchema, body)).toBe(true);
	});

	it("echoes the requested rank name and still serves the seven tiers", async () => {
		const response = await get("/ranked-tiers?banListName=TCG");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.banListName).toBe("TCG");
		expect(body.tiers.map((tier: { id: string }) => tier.id)).toEqual(LADDER_IDS);
		expect(body.tiers[6]).toMatchObject({ id: "master", kind: "relative", size: 5, minGames: 20 });
	});

	it("answers two identical requests with identical bodies", async () => {
		const [first, second] = await Promise.all([
			get("/ranked-tiers?banListName=TCG").then((response) => response.json()),
			get("/ranked-tiers?banListName=TCG").then((response) => response.json()),
		]);

		expect(first).toEqual(second);
	});
});

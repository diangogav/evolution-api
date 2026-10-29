import { describe, expect, it } from "bun:test";

import {
	isNewestTcgSection,
	parseLflist,
} from "../../../../../src/modules/community-decks/infrastructure/parseLflist";

const BASE = `#[2026.10][2026.9 TCG][2026.7]
#[2026.5 TCG][2026.2 TCG]
!2026.10
#forbidden
62320425 0 --Agido the Ancient Sentinel
!2026.9 TCG
#forbidden
06728559 0 --Archnemeses Protos
#limited
80237445 1 --Artifact Mjollnir
!2026.7
12345678 0 --OCG only ban
!2026.5 TCG
11111111 0 --Older TCG ban
`;

const EDISON = `#[2010.3 Edison]
!2010.3 Edison
--StartDate 1970-01-01
--EndDate 2010-04-24
$whitelist
#forbidden
72989439 0 --Black Luster Soldier - Envoy of the Beginning
#limited
910003009 1 --Armory Arm
#unlimited
46986414 3 --Dark Magician
`;

const GENESYS = `#[Genesys]
!Genesys
440556 3 81 --Bahamut Shark
572850 3 50 --Tearlaments Scheiren
`;

describe("parseLflist", () => {
	it("reads the newest TCG section of the base list as a blacklist", () => {
		const list = parseLflist(BASE, isNewestTcgSection);

		expect(list).toEqual({
			label: "2026.9 TCG",
			whitelist: false,
			limits: new Map([
				[6728559, 0],
				[80237445, 1],
			]),
		});
	});

	it("reads Edison as a whitelist with its errata ids", () => {
		const list = parseLflist(EDISON, (header) => header === "2010.3 Edison");

		expect(list?.whitelist).toBe(true);
		expect(list?.label).toBe("2010.3 Edison");
		expect(list?.limits.get(910003009)).toBe(1);
		expect(list?.limits.get(72989439)).toBe(0);
		expect(list?.limits.size).toBe(3);
	});

	it("reads Genesys limits and ignores the points column", () => {
		const list = parseLflist(GENESYS, (header) => header === "Genesys");

		expect(list).toEqual({
			label: "Genesys",
			whitelist: false,
			limits: new Map([
				[440556, 3],
				[572850, 3],
			]),
		});
	});

	it("answers null when no section matches", () => {
		expect(parseLflist(GENESYS, (header) => header === "Edison")).toBeNull();
	});
});

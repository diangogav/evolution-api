import type { MigrationInterface, QueryRunner } from "typeorm";

// Snapshot of the three player decks in evolution-assets
// (`decks/[2010.3 Edison] Halloween - <name>.ydk`, main and extra sections). The duel server
// locks the player to these lists exactly, so a deck change is an UPDATE of this row.
const DECKS = [
	{
		id: "necromancer",
		name: { en: "Necromancer", es: "Nigromante" },
		main: [
			17259470, 17259470, 17259470, 63665875, 63665875, 92826944, 33420078, 77044671, 77044671,
			77044671, 70595331, 70595331, 97021916, 97021916, 23205979, 53839837, 53839837, 26495087,
			26495087, 2204140, 2204140, 2204140, 81439173, 19613556, 5318639, 97169186, 97169186,
			48976825, 75500286, 14087893, 14087893, 44095762, 53582587, 41420027, 29401950, 29401950,
			97077563, 70342110, 70342110, 77538567,
		],
		extra: [
			6021033, 6021033, 5309481, 59969392, 44508094, 70902743, 73580471, 70780151, 23693634,
			26593852, 43385557, 910003009, 88643579, 27315304, 19974580,
		],
	},
	{
		id: "dark-world",
		name: { en: "Dark World", es: "Mundo Oscuro" },
		main: [
			78004197, 78004197, 78004197, 32619583, 32619583, 32619583, 79126789, 79126789, 79126789,
			5498296, 5498296, 33731070, 33731070, 7459013, 51232472, 99458769, 65192027, 74117290,
			74117290, 74117290, 72892473, 33508719, 29826127, 1475311, 93431518, 93431518, 93554166,
			93554166, 19613556, 5318639, 97021916, 97021916, 44095762, 53582587, 41420027, 29401950,
			29401950, 97077563, 70342110, 70342110,
		],
		extra: [
			70902743, 44508094, 70780151, 23693634, 88643579, 73580471, 25862681, 511002994, 511002993,
			27315304, 97204936, 19974580, 26593852, 43385557,
		],
	},
	{
		id: "cursed-garden",
		name: { en: "Cursed Garden", es: "Jardín Maldito" },
		main: [
			48686504, 48686504, 15341821, 15341821, 84824601, 84824601, 84824601, 53257892, 53257892,
			2986553, 2986553, 66457407, 66457407, 19505896, 40320754, 40320754, 83011277, 83011277,
			74440055, 74440055, 11819616, 2295440, 81439173, 19613556, 5318639, 97169186, 97169186,
			14087893, 14087893, 75500286, 44095762, 53582587, 41420027, 29401950, 29401950, 97077563,
			70342110, 70342110, 58120309, 58120309,
		],
		extra: [
			73580471, 45500495, 45500495, 44508094, 70902743, 25958491, 23693634, 43385557, 910003009,
			26593852, 3429238, 97204936, 27315304, 70780151, 88643579,
		],
	},
];

// WindBot botlist names, easiest first: wave n is WAVES[n - 1].
const WAVES = [
	"Haunted",
	"Skeletons",
	"Horde",
	"Archfiends",
	"Vampires",
	"Witches",
	"Lich",
	"Gravekeepers",
];

// Cumulative tiers by waves cleared in one run. Cosmetic slots stay empty until the event
// cosmetics are designed; adding them later is an UPDATE of `prize_tiers`.
const PRIZE_TIERS = [
	{ wavesCleared: 3, essence: 150, cosmeticIds: [] },
	{ wavesCleared: 5, essence: 250, cosmeticIds: [] },
	{ wavesCleared: 8, essence: 400, cosmeticIds: [] },
];

/**
 * Seeds the Halloween 2026 gauntlet: pick one of three decks, beat eight Edison bots in a
 * row, three runs per UTC day. The window is configuration: adjust `starts_at`/`ends_at`
 * with an UPDATE if the launch moves.
 */
export class SeedHalloween2026Event1782000200000 implements MigrationInterface {
	name = "SeedHalloween2026Event1782000200000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`INSERT INTO "event_catalog" ("id", "name", "description", "format", "starts_at", "ends_at", "attempts_per_day", "waves", "decks", "prize_tiers") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			[
				"halloween-2026",
				JSON.stringify({ en: "Halloween Horde", es: "Horda de Halloween" }),
				JSON.stringify({
					en: "Pick a cursed deck and survive eight waves of the undead. One loss ends the run.",
					es: "Elige un deck maldito y sobrevive a ocho oleadas de no muertos. Una derrota termina la partida.",
				}),
				"edison",
				"2026-10-28T00:00:00Z",
				"2026-11-08T00:00:00Z",
				3,
				JSON.stringify(WAVES),
				JSON.stringify(DECKS),
				JSON.stringify(PRIZE_TIERS),
			],
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DELETE FROM "event_catalog" WHERE "id" = $1`, ["halloween-2026"]);
	}
}

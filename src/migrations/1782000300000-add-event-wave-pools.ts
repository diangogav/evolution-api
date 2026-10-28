import type { MigrationInterface, QueryRunner } from "typeorm";

const EVENT_ID = "halloween-2026";

const EASY = ["Haunted", "Skeletons", "Horde"];
const MEDIUM = ["Archfiends", "Vampires", "Witches"];
// The three player decks, piloted by WindBot.
const HARD = ["DarkWorld", "CursedGarden", "Necromancer"];

// WindBot botlist names. Each wave's rival is drawn from its pool when the wave becomes
// current, never the player's own deck and never a bot the run already faced.
const WAVES = [
	{ tier: "easy", pool: EASY },
	{ tier: "easy", pool: EASY },
	{ tier: "medium", pool: MEDIUM },
	{ tier: "medium", pool: MEDIUM },
	{ tier: "hard", pool: HARD },
	{ tier: "hard", pool: HARD },
	{ tier: "miniboss", pool: ["Lich"] },
	{ tier: "boss", pool: ["Gravekeepers"] },
];

// The bot that pilots each player deck, stored on the deck as `botName`.
const DECK_BOTS = {
	necromancer: "Necromancer",
	"dark-world": "DarkWorld",
	"cursed-garden": "CursedGarden",
};

// The fixed order the seed shipped with, restored on revert.
const FIXED_WAVES = [
	"Haunted",
	"Skeletons",
	"Horde",
	"Archfiends",
	"Vampires",
	"Witches",
	"Lich",
	"Gravekeepers",
];

// Backfills read the old catalog shape (an array of bot names, wave n at index n - 1), so
// they run before the catalog row is replaced and skip catalogs already in the pool shape.
const OLD_SHAPE = `jsonb_typeof(c.waves -> 0) = 'string'`;

/**
 * Wave pools: an event wave becomes `{ tier, pool }` and its rival is drawn per run. The
 * run stores the rival of its current wave (`current_bot`, so a voided duel is retried
 * against the same bot) and the rivals it beat (`faced_bots`); each reservation stores the
 * bot it was issued against. Runs and reservations created under the fixed order keep the
 * bot that order gave them.
 */
export class AddEventWavePools1782000300000 implements MigrationInterface {
	name = "AddEventWavePools1782000300000";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "event_runs" ADD "current_bot" character varying(64), ADD "faced_bots" jsonb NOT NULL DEFAULT '[]'`,
		);
		// Nullable: reservations issued before this migration are backfilled below when their
		// catalog allows it; every new reservation is written with its bot.
		await queryRunner.query(
			`ALTER TABLE "event_run_reservations" ADD "bot_name" character varying(64)`,
		);

		await queryRunner.query(
			`UPDATE "event_runs" AS r SET "faced_bots" = COALESCE((SELECT jsonb_agg(w.bot ORDER BY w.n) FROM jsonb_array_elements_text(c.waves) WITH ORDINALITY AS w(bot, n) WHERE w.n <= r.waves_cleared), '[]'::jsonb) FROM "event_catalog" AS c WHERE c.id = r.event_id AND ${OLD_SHAPE}`,
		);
		await queryRunner.query(
			`UPDATE "event_runs" AS r SET "current_bot" = c.waves ->> (r.current_wave - 1) FROM "event_catalog" AS c WHERE c.id = r.event_id AND r.status = 'ready' AND ${OLD_SHAPE}`,
		);
		await queryRunner.query(
			`UPDATE "event_run_reservations" AS v SET "bot_name" = c.waves ->> (v.wave - 1) FROM "event_runs" AS r JOIN "event_catalog" AS c ON c.id = r.event_id WHERE r.id = v.run_id AND ${OLD_SHAPE}`,
		);

		await queryRunner.query(
			`UPDATE "event_catalog" SET "waves" = $2::jsonb, "decks" = (SELECT COALESCE(jsonb_agg(CASE WHEN $3::jsonb ? (d.deck ->> 'id') THEN d.deck || jsonb_build_object('botName', $3::jsonb ->> (d.deck ->> 'id')) ELSE d.deck END ORDER BY d.n), '[]'::jsonb) FROM jsonb_array_elements("decks") WITH ORDINALITY AS d(deck, n)), "updated_at" = now() WHERE "id" = $1`,
			[EVENT_ID, JSON.stringify(WAVES), JSON.stringify(DECK_BOTS)],
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`UPDATE "event_catalog" SET "waves" = $2::jsonb, "decks" = (SELECT COALESCE(jsonb_agg(d.deck - 'botName' ORDER BY d.n), '[]'::jsonb) FROM jsonb_array_elements("decks") WITH ORDINALITY AS d(deck, n)), "updated_at" = now() WHERE "id" = $1`,
			[EVENT_ID, JSON.stringify(FIXED_WAVES)],
		);
		await queryRunner.query(`ALTER TABLE "event_run_reservations" DROP COLUMN "bot_name"`);
		await queryRunner.query(
			`ALTER TABLE "event_runs" DROP COLUMN "current_bot", DROP COLUMN "faced_bots"`,
		);
	}
}

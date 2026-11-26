import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * WindBot entrants for lightning tournaments that start short of players. An entry is keyed
 * by a user (FK to users), so each bot is a real `users` row that cannot log in: its
 * passwords hash a random secret nobody keeps and its address is on the reserved `.invalid`
 * domain. `lightning_bot_accounts` says which WindBot the duel server requests for that
 * user, and in which format; the names match the server's botlist.
 */
export const LIGHTNING_BOTS: ReadonlyArray<{
	id: string;
	format: "tcg" | "edison" | "jtp";
	botName: string;
}> = [
	{ id: "00000000-0000-4000-8000-00000000b001", format: "tcg", botName: "Salamangreat" },
	{ id: "00000000-0000-4000-8000-00000000b002", format: "tcg", botName: "Sky Striker" },
	{ id: "00000000-0000-4000-8000-00000000b003", format: "tcg", botName: "Labrynth" },
	{ id: "00000000-0000-4000-8000-00000000b004", format: "tcg", botName: "Yubel" },
	{ id: "00000000-0000-4000-8000-00000000b005", format: "tcg", botName: "Swordsoul" },
	{ id: "00000000-0000-4000-8000-00000000b006", format: "tcg", botName: "Ryzeal" },
	{ id: "00000000-0000-4000-8000-00000000b007", format: "tcg", botName: "Maliss" },
	{ id: "00000000-0000-4000-8000-00000000b101", format: "edison", botName: "Blackwing" },
	{ id: "00000000-0000-4000-8000-00000000b102", format: "edison", botName: "Lightsworn" },
	{ id: "00000000-0000-4000-8000-00000000b103", format: "edison", botName: "Machina" },
	{ id: "00000000-0000-4000-8000-00000000b201", format: "jtp", botName: "Joey" },
	{ id: "00000000-0000-4000-8000-00000000b202", format: "jtp", botName: "Yugi" },
];

// Not exported: TypeORM loads every function a migration file exports as a migration class.
const botUsername = (botName: string) => `${botName} Bot`;

const botEmail = (botName: string) =>
	`${botName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@bots.evolution.invalid`;

export class LightningBotFill1783500000000 implements MigrationInterface {
	name = "LightningBotFill1783500000000";

	async up(queryRunner: QueryRunner): Promise<void> {
		// Usernames are compared ignoring case everywhere else, so a clash is checked the same way.
		const usernames = LIGHTNING_BOTS.map((bot) => botUsername(bot.botName).toLowerCase());
		const emails = LIGHTNING_BOTS.map((bot) => botEmail(bot.botName));
		const taken: Array<{ username: string; email: string }> = await queryRunner.query(
			`SELECT "username", "email" FROM "users" WHERE lower("username") = ANY($1) OR lower("email") = ANY($2)`,
			[usernames, emails],
		);
		if (taken.length > 0) {
			throw new Error(
				`Lightning bot accounts clash with existing users: ${taken.map((row) => row.username).join(", ")}`,
			);
		}

		for (const bot of LIGHTNING_BOTS) {
			const unusable = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
			await queryRunner.query(
				`INSERT INTO "users" ("id", "username", "password", "secure_password", "email") VALUES ($1, $2, $3, $3, $4)`,
				[bot.id, botUsername(bot.botName), unusable, botEmail(bot.botName)],
			);
		}
		await queryRunner.query(
			`CREATE TABLE "lightning_bot_accounts" ("user_id" character varying NOT NULL, "format" character varying(32) NOT NULL, "bot_name" character varying(32) NOT NULL, "sort_order" integer NOT NULL, CONSTRAINT "PK_lightning_bot_accounts" PRIMARY KEY ("user_id"), CONSTRAINT "FK_lightning_bot_accounts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`,
		);
		for (const [order, bot] of LIGHTNING_BOTS.entries()) {
			await queryRunner.query(
				`INSERT INTO "lightning_bot_accounts" ("user_id", "format", "bot_name", "sort_order") VALUES ($1, $2, $3, $4)`,
				[bot.id, bot.format, bot.botName, order],
			);
		}
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "lightning_bot_accounts"`);
		// The bots' entries and results go with them (the FKs cascade from users).
		await queryRunner.query(`DELETE FROM "users" WHERE "id" = ANY($1)`, [
			LIGHTNING_BOTS.map((bot) => bot.id),
		]);
	}
}

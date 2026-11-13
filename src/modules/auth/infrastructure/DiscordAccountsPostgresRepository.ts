import { dataSource } from "../../../evolution-types/src/data-source";
import { UserProfileEntity } from "../../../evolution-types/src/entities/UserProfileEntity";
import { DiscordAccounts, EmailAccount, LinkedAccount } from "../domain/DiscordAccounts";

// Raw SQL: the match ignores case and must see deleted users, which the entity
// repository hides.
const FIND_BY_EMAIL = `SELECT "id", "username", "email", "discord_id", "deleted_at"
FROM "users" WHERE LOWER("email") = LOWER($1)`;

// The discord_id guard makes the link a no-op for a user that got one meanwhile.
// COALESCE keeps an earlier verification date.
const LINK = `UPDATE "users"
SET "discord_id" = $2, "email_verified_at" = COALESCE("email_verified_at", $3)
WHERE "id" = $1 AND "discord_id" IS NULL AND "deleted_at" IS NULL
RETURNING "id"`;

type EmailAccountRow = {
	id: string;
	username: string;
	email: string;
	discord_id: string | null;
	deleted_at: Date | null;
};

export class DiscordAccountsPostgresRepository implements DiscordAccounts {
	async findByDiscordId(discordId: string): Promise<LinkedAccount | null> {
		const user = await dataSource.getRepository(UserProfileEntity).findOne({
			select: { id: true },
			where: { discordId },
		});

		return user ? { id: user.id } : null;
	}

	async findByEmail(email: string): Promise<EmailAccount[]> {
		const rows: EmailAccountRow[] = await dataSource.query(FIND_BY_EMAIL, [email]);

		return rows.map((row) => ({
			id: row.id,
			username: row.username,
			email: row.email,
			discordId: row.discord_id || null,
			deleted: row.deleted_at !== null,
		}));
	}

	async link(userId: string, discordId: string, verifiedAt: Date): Promise<boolean> {
		const result: unknown = await dataSource.query(LINK, [userId, discordId, verifiedAt]);

		return linkedRows(result) > 0;
	}
}

// The pg driver answers an UPDATE ... RETURNING through TypeORM as [rows, count].
function linkedRows(result: unknown): number {
	if (!Array.isArray(result)) return 0;
	const [rows] = result;
	return Array.isArray(rows) ? rows.length : result.length;
}

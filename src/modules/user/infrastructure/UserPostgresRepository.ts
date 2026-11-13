import { dataSource } from "../../../evolution-types/src/data-source";
import { UserProfileEntity } from "../../../evolution-types/src/entities/UserProfileEntity";
import { EmailChanges, EmailTakenError } from "../domain/EmailChanges";
import { EmailVerifications } from "../domain/EmailVerifications";
import { User } from "../domain/User";
import { UserRepository, VerifiedDiscordIdentity } from "../domain/UserRepository";

// COALESCE keeps the date of an earlier verification.
const MARK_EMAIL_VERIFIED = `UPDATE "users"
SET "email_verified_at" = COALESCE("email_verified_at", $2) WHERE "id" = $1`;

const IS_EMAIL_VERIFIED = `SELECT "email_verified_at" IS NOT NULL AS "verified" FROM "users" WHERE "id" = $1`;

// Deleted users count: the unique index on email covers them too.
const IS_EMAIL_IN_USE = `SELECT 1 FROM "users" WHERE LOWER("email") = LOWER($1) LIMIT 1`;

// The email guard makes a second use of the same link, or a stale one, a no-op.
const CHANGE_EMAIL = `UPDATE "users" SET "email" = $3, "email_verified_at" = $4
WHERE "id" = $1 AND "email" = $2 AND "deleted_at" IS NULL RETURNING "id"`;

const UNIQUE_VIOLATION = "23505";

export class UserPostgresRepository implements UserRepository, EmailVerifications, EmailChanges {
	async isEmailInUse(email: string): Promise<boolean> {
		const rows: unknown[] = await dataSource.query(IS_EMAIL_IN_USE, [email]);

		return rows.length > 0;
	}

	async changeEmail(input: {
		userId: string;
		currentEmail: string;
		newEmail: string;
		verifiedAt: Date;
	}): Promise<boolean> {
		let result: unknown;
		try {
			result = await dataSource.query(CHANGE_EMAIL, [
				input.userId,
				input.currentEmail,
				input.newEmail,
				input.verifiedAt,
			]);
		} catch (error) {
			// Another user took the address between the check and this write.
			const code = (error as { code?: string; driverError?: { code?: string } }).driverError?.code;
			if (code === UNIQUE_VIOLATION || (error as { code?: string }).code === UNIQUE_VIOLATION) {
				throw new EmailTakenError();
			}
			throw error;
		}

		// The pg driver answers an UPDATE ... RETURNING through TypeORM as [rows, count].
		const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
		return Array.isArray(rows) && rows.length > 0;
	}

	async isVerified(userId: string): Promise<boolean> {
		const rows: { verified: boolean }[] = await dataSource.query(IS_EMAIL_VERIFIED, [userId]);

		return rows[0]?.verified === true;
	}

	async markVerified(userId: string, at: Date): Promise<void> {
		await dataSource.query(MARK_EMAIL_VERIFIED, [userId, at]);
	}

	async findByEmailOrUsername(email: string, username: string): Promise<User | null> {
		const repository = dataSource.getRepository(UserProfileEntity);
		const userProfileEntity = await repository.findOne({
			where: [{ email }, { username }],
		});

		if (!userProfileEntity) {
			return null;
		}

		return User.from(userProfileEntity);
	}

	async create(user: User, discord?: VerifiedDiscordIdentity): Promise<void> {
		const repository = dataSource.getRepository(UserProfileEntity);
		const userProfileEntity = repository.create({
			id: user.id,
			username: user.username,
			password: user.password,
			securePassword: user.securePassword,
			email: user.email,
			...(discord
				? { discordId: discord.discordId, emailVerifiedAt: discord.emailVerifiedAt }
				: {}),
		});
		await repository.save(userProfileEntity);
	}

	async findByEmail(email: string): Promise<User | null> {
		const repository = dataSource.getRepository(UserProfileEntity);
		const userProfileEntity = await repository.findOne({
			where: {
				email,
			},
		});

		if (!userProfileEntity) {
			return null;
		}

		return User.from(userProfileEntity);
	}

	async findByUsername(username: string): Promise<User | null> {
		const repository = dataSource.getRepository(UserProfileEntity);
		const userProfileEntity = await repository.findOne({
			where: {
				username,
			},
		});

		if (!userProfileEntity) {
			return null;
		}

		return User.from(userProfileEntity);
	}

	async findById(id: string): Promise<User | null> {
		const repository = dataSource.getRepository(UserProfileEntity);
		const userProfileEntity = await repository.findOne({
			where: {
				id,
			},
		});

		if (!userProfileEntity) {
			return null;
		}

		return User.from(userProfileEntity);
	}

	async update(user: User): Promise<void> {
		const repository = dataSource.getRepository(UserProfileEntity);

		const updatedUserProfileEntity = repository.create({
			id: user.id,
			username: user.username,
			email: user.email,
			password: user.password,
			securePassword: user.securePassword,
		});

		await repository.save(updatedUserProfileEntity);
	}
}

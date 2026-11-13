import { dataSource } from "../../../evolution-types/src/data-source";
import { UserProfileEntity } from "../../../evolution-types/src/entities/UserProfileEntity";
import { EmailVerifications } from "../domain/EmailVerifications";
import { User } from "../domain/User";
import { UserRepository, VerifiedDiscordIdentity } from "../domain/UserRepository";

// COALESCE keeps the date of an earlier verification.
const MARK_EMAIL_VERIFIED = `UPDATE "users"
SET "email_verified_at" = COALESCE("email_verified_at", $2) WHERE "id" = $1`;

const IS_EMAIL_VERIFIED = `SELECT "email_verified_at" IS NOT NULL AS "verified" FROM "users" WHERE "id" = $1`;

export class UserPostgresRepository implements UserRepository, EmailVerifications {
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

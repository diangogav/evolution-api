import { dataSource } from "../../../evolution-types/src/data-source";
import { UserProfileEntity } from "../../../evolution-types/src/entities/UserProfileEntity";
import { User } from "../domain/User";
import { UserRepository } from "../domain/UserRepository";

export class UserPostgresRepository implements UserRepository {
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

	async create(user: User): Promise<void> {
		const repository = dataSource.getRepository(UserProfileEntity);
		const userProfileEntity = repository.create({
			id: user.id,
			username: user.username,
			password: user.password,
			email: user.email,
		});
		await repository.save(userProfileEntity);
	}
}

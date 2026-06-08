import { dataSource } from "../../../evolution-types/src/data-source";
import { UserProfileEntity } from "../../../evolution-types/src/entities/UserProfileEntity";
import { UserDirectory } from "../domain/UserDirectory";

// Reads from the shared user table (evolution-types DataSource) — usernames live
// there, not in the cosmetics schema.
export class UserDirectoryPostgresRepository implements UserDirectory {
	async findUserIdByUsername(username: string): Promise<string | null> {
		const repository = dataSource.getRepository(UserProfileEntity);
		const entity = await repository.findOne({ where: { username } });

		return entity?.id ?? null;
	}
}

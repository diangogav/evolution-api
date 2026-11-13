import { dataSource } from "../../../evolution-types/src/data-source";
import { UserProfileEntity } from "../../../evolution-types/src/entities/UserProfileEntity";
import { DiscordAccounts, LinkedAccount } from "../domain/DiscordAccounts";

export class DiscordAccountsPostgresRepository implements DiscordAccounts {
	async findByDiscordId(discordId: string): Promise<LinkedAccount | null> {
		const user = await dataSource.getRepository(UserProfileEntity).findOne({
			select: { id: true },
			where: { discordId },
		});

		return user ? { id: user.id } : null;
	}
}

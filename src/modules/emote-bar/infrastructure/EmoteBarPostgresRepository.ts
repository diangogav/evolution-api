import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { EMOTE_BAR_SLOTS, EmoteBar } from "../domain/EmoteBar";
import { EmoteBarRepository } from "../domain/EmoteBarRepository";
import { UserEmoteBarEntity } from "./UserEmoteBarEntity";

export class EmoteBarPostgresRepository implements EmoteBarRepository {
	async findByUserId(userId: string): Promise<readonly string[] | null> {
		const row = await cosmeticsDataSource.getRepository(UserEmoteBarEntity).findOneBy({ userId });
		return row?.emoteRefs?.length === EMOTE_BAR_SLOTS ? row.emoteRefs : null;
	}

	async save(userId: string, bar: EmoteBar): Promise<void> {
		// A single INSERT ... ON CONFLICT (user_id) DO UPDATE replaces the whole bar, so
		// concurrent first saves for one user cannot collide on the primary key.
		await cosmeticsDataSource
			.createQueryBuilder()
			.insert()
			.into(UserEmoteBarEntity)
			.values({ userId, emoteRefs: bar.refs().map(String) })
			.orUpdate(["emote_refs", "updated_at"], ["user_id"])
			.execute();
	}
}

import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { EmoteBar } from "../domain/EmoteBar";
import { EmoteBarRepository } from "../domain/EmoteBarRepository";
import { UserEmoteBarEntity } from "./UserEmoteBarEntity";

export class EmoteBarPostgresRepository implements EmoteBarRepository {
	async findByUserId(userId: string): Promise<EmoteBar | null> {
		const row = await cosmeticsDataSource.getRepository(UserEmoteBarEntity).findOneBy({ userId });
		return row ? EmoteBar.create(row.emoteRefs) : null;
	}

	async save(userId: string, bar: EmoteBar): Promise<void> {
		// Upsert by primary key: the whole bar is replaced in a single statement.
		await cosmeticsDataSource
			.getRepository(UserEmoteBarEntity)
			.save({ userId, emoteRefs: bar.refs().map(String) });
	}
}

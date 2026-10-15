import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

// One row per user; emote_refs holds the 8 slots in order. A CHECK constraint keeps it at 8.
@Entity({ name: "user_emote_bars" })
export class UserEmoteBarEntity {
	// FK to users(id), which is varchar in the shared schema — not uuid.
	@PrimaryColumn({ name: "user_id", type: "varchar" })
	userId: string;

	@Column({ name: "emote_refs", type: "varchar", length: 48, array: true })
	emoteRefs: string[];

	@UpdateDateColumn({ name: "updated_at" })
	updatedAt: Date;
}

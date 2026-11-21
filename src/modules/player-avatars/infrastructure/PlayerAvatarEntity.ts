import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

// One row per user holding their avatar choices as JSON.
@Entity({ name: "player_avatars" })
export class PlayerAvatarEntity {
	// FK to users(id), which is varchar in the shared schema — not uuid.
	@PrimaryColumn({ name: "user_id", type: "varchar" })
	userId: string;

	@Column({ name: "config", type: "jsonb" })
	config: unknown;

	@UpdateDateColumn({ name: "updated_at" })
	updatedAt: Date;
}

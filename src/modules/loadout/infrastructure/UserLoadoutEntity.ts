import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

import { CosmeticType } from "../../catalog/domain/CosmeticType";

// One row per equipped slot (user_id, cosmetic_type). The cosmetic_type is part of
// the primary key so a user has at most one cosmetic equipped per slot.
@Entity({ name: "user_loadouts" })
export class UserLoadoutEntity {
	// FK to users(id), which is varchar in the shared schema — not uuid.
	@PrimaryColumn({ name: "user_id", type: "varchar" })
	userId: string;

	@PrimaryColumn({
		name: "cosmetic_type",
		type: "enum",
		enum: CosmeticType,
		enumName: "cosmetic_type_enum",
	})
	cosmeticType: CosmeticType;

	@Column({ name: "cosmetic_id", type: "uuid" })
	cosmeticId: string;

	@UpdateDateColumn({ name: "updated_at" })
	updatedAt: Date;
}

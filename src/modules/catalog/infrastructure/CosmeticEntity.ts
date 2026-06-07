import {
	Column,
	CreateDateColumn,
	Entity,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from "typeorm";

import { CosmeticTier } from "../domain/CosmeticTier";
import { CosmeticType } from "../domain/CosmeticType";

@Entity({ name: "cosmetics" })
export class CosmeticEntity {
	@PrimaryGeneratedColumn("uuid")
	id: string;

	@Column({ type: "enum", enum: CosmeticType, enumName: "cosmetic_type_enum" })
	type: CosmeticType;

	@Column({ type: "enum", enum: CosmeticTier, enumName: "cosmetic_tier_enum" })
	tier: CosmeticTier;

	@Column({ name: "asset_ref" })
	assetRef: string;

	@Column({ name: "display_name" })
	displayName: string;

	@Column({ default: true })
	active: boolean;

	@CreateDateColumn({ name: "created_at" })
	createdAt: Date;

	@UpdateDateColumn({ name: "updated_at" })
	updatedAt: Date;
}

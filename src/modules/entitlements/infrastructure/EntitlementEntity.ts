import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

import { EntitlementSource } from "../domain/EntitlementSource";
import { GrantType } from "../domain/GrantType";

@Entity({ name: "entitlements" })
export class EntitlementEntity {
	@PrimaryGeneratedColumn("uuid")
	id: string;

	// FK to users(id), which is varchar in the shared schema — not uuid.
	@Index()
	@Column({ name: "user_id", type: "varchar" })
	userId: string;

	@Column({ name: "grant_type", type: "enum", enum: GrantType, enumName: "grant_type_enum" })
	grantType: GrantType;

	@Column({ name: "grant_value" })
	grantValue: string;

	@Column({ type: "enum", enum: EntitlementSource, enumName: "entitlement_source_enum" })
	source: EntitlementSource;

	@Column({ name: "expires_at", type: "timestamptz", nullable: true })
	expiresAt: Date | null;

	@CreateDateColumn({ name: "created_at" })
	createdAt: Date;
}

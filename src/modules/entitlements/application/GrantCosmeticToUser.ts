import type { CosmeticRepository } from "../../catalog/domain/CosmeticRepository";
import type { UserDirectory } from "../../loadout/domain/UserDirectory";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { Entitlement } from "../domain/Entitlement";
import type { EntitlementRepository } from "../domain/EntitlementRepository";
import { EntitlementSource } from "../domain/EntitlementSource";
import { GrantType } from "../domain/GrantType";

export interface GrantCosmeticToUserInput {
	readonly cosmeticId: string;
	readonly username: string;
	readonly source: EntitlementSource;
}

export interface GrantCosmeticByUserIdInput {
	readonly cosmeticId: string;
	readonly userId: string;
	readonly source: EntitlementSource;
}

export interface CosmeticGrantDto {
	readonly cosmeticId: string;
	readonly userId: string;
	readonly username: string;
	readonly source: EntitlementSource;
	readonly created: boolean;
}

export class GrantCosmeticToUser {
	constructor(
		private readonly cosmetics: CosmeticRepository,
		private readonly entitlements: EntitlementRepository,
		private readonly users: UserDirectory,
	) {}

	async run(input: GrantCosmeticToUserInput): Promise<CosmeticGrantDto> {
		const username = input.username.trim();
		const userId = await this.users.findUserIdByUsername(username);
		if (!userId) throw new NotFoundError(`User "${username}" not found`);

		const granted = await this.runForUserId({
			cosmeticId: input.cosmeticId,
			userId,
			source: input.source,
		});
		return { ...granted, username };
	}

	// Same grant keyed by user id, for callers that already hold it (mission rewards).
	async runForUserId(
		input: GrantCosmeticByUserIdInput,
	): Promise<Omit<CosmeticGrantDto, "username">> {
		const cosmetic = await this.cosmetics.findById(input.cosmeticId);
		if (!cosmetic || !cosmetic.active) {
			throw new NotFoundError(`Cosmetic "${input.cosmeticId}" not found`);
		}

		const existing = await this.entitlements.findByUserId(input.userId);
		const alreadyGranted = existing.some(
			(entitlement) =>
				entitlement.grantType === GrantType.COSMETIC &&
				entitlement.grantValue === cosmetic.id &&
				entitlement.isActiveAt(new Date()),
		);

		if (!alreadyGranted) {
			await this.entitlements.save(
				Entitlement.create({
					id: crypto.randomUUID(),
					userId: input.userId,
					grantType: GrantType.COSMETIC,
					grantValue: cosmetic.id,
					source: input.source,
					expiresAt: null,
				}),
			);
		}

		return {
			cosmeticId: cosmetic.id,
			userId: input.userId,
			source: input.source,
			created: !alreadyGranted,
		};
	}
}

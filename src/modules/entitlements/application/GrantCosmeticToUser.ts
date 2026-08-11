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
		const cosmetic = await this.cosmetics.findById(input.cosmeticId);
		if (!cosmetic || !cosmetic.active) {
			throw new NotFoundError(`Cosmetic "${input.cosmeticId}" not found`);
		}

		const username = input.username.trim();
		const userId = await this.users.findUserIdByUsername(username);
		if (!userId) throw new NotFoundError(`User "${username}" not found`);

		const existing = await this.entitlements.findByUserId(userId);
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
					userId,
					grantType: GrantType.COSMETIC,
					grantValue: cosmetic.id,
					source: input.source,
					expiresAt: null,
				}),
			);
		}

		return {
			cosmeticId: cosmetic.id,
			userId,
			username,
			source: input.source,
			created: !alreadyGranted,
		};
	}
}

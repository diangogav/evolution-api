import { ForbiddenError } from "../../../shared/errors/ForbiddenError";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { CosmeticRepository } from "../../catalog/domain/CosmeticRepository";
import { CosmeticType } from "../../catalog/domain/CosmeticType";
import { EntitlementsGatekeeper } from "../../entitlements/application/EntitlementsGatekeeper";
import { LoadoutRepository } from "../domain/LoadoutRepository";

export class EquipCosmetic {
	constructor(
		private readonly cosmetics: CosmeticRepository,
		private readonly loadouts: LoadoutRepository,
		private readonly gatekeeper: EntitlementsGatekeeper,
	) {}

	async run({
		userId,
		cosmeticType,
		cosmeticId,
	}: {
		userId: string;
		cosmeticType: CosmeticType;
		cosmeticId: string;
	}): Promise<void> {
		const cosmetic = await this.cosmetics.findById(cosmeticId);
		if (!cosmetic) {
			throw new NotFoundError(`Cosmetic ${cosmeticId} not found`);
		}
		if (cosmetic.type !== cosmeticType) {
			throw new InvalidArgumentError(`Cosmetic ${cosmeticId} cannot be equipped in the ${cosmeticType} slot`);
		}
		// Access is always decided by the gate — never compared here (RFC §8).
		if (!(await this.gatekeeper.canUse(userId, cosmetic))) {
			throw new ForbiddenError(`User is not entitled to cosmetic ${cosmeticId}`);
		}

		const loadout = await this.loadouts.findByUserId(userId);
		loadout.equip(cosmeticType, cosmeticId);
		await this.loadouts.save(loadout);
	}
}

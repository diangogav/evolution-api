import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import type { CompanionAnimationDescriptor } from "../domain/CompanionAnimation";
import type { CosmeticRepository } from "../domain/CosmeticRepository";
import { CosmeticType } from "../domain/CosmeticType";

export interface ConfigureCompanionAnimationInput {
	readonly cosmeticId: string;
	readonly animation?: CompanionAnimationDescriptor;
}

export interface ConfiguredCompanionAnimationDto {
	readonly cosmeticId: string;
	readonly animation?: CompanionAnimationDescriptor;
}

/** Updates only the data-driven animation profile of an existing companion. */
export class ConfigureCompanionAnimation {
	constructor(private readonly cosmetics: CosmeticRepository) {}

	async run(input: ConfigureCompanionAnimationInput): Promise<ConfiguredCompanionAnimationDto> {
		const cosmetic = await this.cosmetics.findById(input.cosmeticId);
		if (!cosmetic) throw new NotFoundError(`Cosmetic "${input.cosmeticId}" not found`);
		if (cosmetic.type !== CosmeticType.COMPANION) {
			throw new InvalidArgumentError("Animation profiles can only be configured for companions");
		}

		const configured = cosmetic.configureAnimation(input.animation);
		await this.cosmetics.save(configured);

		return {
			cosmeticId: configured.id,
			...(configured.animation ? { animation: configured.animation } : {}),
		};
	}
}

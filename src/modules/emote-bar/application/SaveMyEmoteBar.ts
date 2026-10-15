import { ForbiddenError } from "../../../shared/errors/ForbiddenError";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { CosmeticRepository } from "../../catalog/domain/CosmeticRepository";
import { EntitlementsGatekeeper } from "../../entitlements/application/EntitlementsGatekeeper";
import { EmoteBar } from "../domain/EmoteBar";
import { EmoteBarRepository } from "../domain/EmoteBarRepository";
import { activeEmotePacksBySlug, packHasEmote } from "./activeEmotePacks";

export class SaveMyEmoteBar {
	constructor(
		private readonly cosmetics: CosmeticRepository,
		private readonly bars: EmoteBarRepository,
		private readonly gatekeeper: EntitlementsGatekeeper,
	) {}

	async run({ userId, slots }: { userId: string; slots: readonly string[] }): Promise<void> {
		const bar = EmoteBar.create(slots);
		const packRefs = bar.refs().filter((ref) => !ref.isDefault);

		if (packRefs.length > 0) {
			const packs = activeEmotePacksBySlug(await this.cosmetics.findAll());
			// Access is always decided by the gate, as when equipping a cosmetic.
			const access = await this.gatekeeper.accessFor(userId);
			for (const ref of packRefs) {
				const pack = packs.get(ref.packSlug as string);
				if (!pack || !packHasEmote(pack, ref.emoteKey as string)) {
					throw new InvalidArgumentError(`Emote "${ref}" does not exist`);
				}
				if (!access.canUse(pack)) {
					throw new ForbiddenError(`User is not entitled to cosmetic ${pack.id}`);
				}
			}
		}

		await this.bars.save(userId, bar);
	}
}

import { ladderFor, TIER_CATALOG, TierCatalog, TierDefinition } from "../domain/TierCatalog";
import { TierCatalogView, TierDefinitionView } from "./dtos/TierCatalogView";

/** The public description of the ladder a rank plays under, with its overrides already applied. */
export class GetTierCatalog {
	constructor(private readonly catalog: TierCatalog = TIER_CATALOG) {}

	run(banListName?: string): TierCatalogView {
		const ladder = ladderFor(banListName, this.catalog);

		return {
			banListName: banListName ?? null,
			dailyOpponentCap: ladder.dailyOpponentCap,
			dayBoundary: "UTC",
			tiers: ladder.tiers.map(toTierDefinitionView),
		};
	}
}

function toTierDefinitionView(tier: TierDefinition): TierDefinitionView {
	return {
		id: tier.id,
		name: tier.name,
		order: tier.order,
		kind: tier.kind,
		icon: tier.icon,
		threshold: tier.threshold,
		minGames: tier.minGames,
		distinctOpponentWins: tier.distinctOpponentWins,
		requiresTier: tier.requiresTier,
		size: tier.size,
	};
}

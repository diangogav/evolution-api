import { CosmeticType } from "../../catalog/domain/CosmeticType";

export interface LoadoutItem {
	cosmeticType: CosmeticType;
	cosmeticId: string;
}

// A user's active loadout: at most one cosmetic equipped per slot (cosmetic type).
export class Loadout {
	private constructor(
		public readonly userId: string,
		private readonly equipped: Map<CosmeticType, string>,
	) {}

	static empty(userId: string): Loadout {
		return new Loadout(userId, new Map());
	}

	static from(userId: string, items: LoadoutItem[]): Loadout {
		return new Loadout(userId, new Map(items.map((item) => [item.cosmeticType, item.cosmeticId])));
	}

	equip(cosmeticType: CosmeticType, cosmeticId: string): void {
		this.equipped.set(cosmeticType, cosmeticId);
	}

	equippedCosmeticId(cosmeticType: CosmeticType): string | null {
		return this.equipped.get(cosmeticType) ?? null;
	}

	items(): LoadoutItem[] {
		return Array.from(this.equipped, ([cosmeticType, cosmeticId]) => ({ cosmeticType, cosmeticId }));
	}
}

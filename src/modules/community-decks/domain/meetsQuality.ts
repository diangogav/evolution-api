import type { CommunityDeckCategory } from "./CommunityDeckCategory";

export function meetsQuality(
	category: CommunityDeckCategory,
	views: number,
	minViews: number,
): boolean {
	return !category.requiresViews || views >= minViews;
}

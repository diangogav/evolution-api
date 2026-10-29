import type { CardAlternates } from "./CardAlternates";

export interface CardAlternatesSource {
	fetch(): Promise<CardAlternates>;
}

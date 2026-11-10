import { DeckValidation } from "../../community-decks";
import { LightningDeck } from "./LightningEntry";
import { LightningFormat } from "./LightningTournament";

// Sizes, copy limits and ban list legality of a deck under a tournament's format. The
// server checks again at join; this check is so the player learns at registration.
export interface DeckLegalityChecker {
	check(format: LightningFormat, deck: LightningDeck): Promise<DeckValidation>;
}

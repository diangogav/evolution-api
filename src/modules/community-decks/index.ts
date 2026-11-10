// Public surface of the community-decks module. Other modules import from here, never
// from its folders; see the module boundaries section of docs/architecture.md.

export type { CardAlternates } from "./domain/CardAlternates";
export type { CardAlternatesSource } from "./domain/CardAlternatesSource";
export { FORMAT_LIST_IDS } from "./domain/CommunityDeckCategory";
export type { FormatListId } from "./domain/CommunityDeckCategory";
export type { DeckLists } from "./domain/DeckLists";
export type { FormatList } from "./domain/FormatList";
export type { FormatListSource } from "./domain/FormatListSource";
export { validateDeck } from "./domain/validateDeck";
export type { DeckValidation } from "./domain/validateDeck";

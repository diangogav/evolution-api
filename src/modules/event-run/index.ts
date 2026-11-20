// Public surface of the event-run module. Other modules import from here, never from
// its folders; see the module boundaries section of docs/architecture.md.

export type { EventCatalogListing, EventCatalogRepository } from "./domain/EventCatalogRepository";
export type { EventDefinition } from "./domain/EventDefinition";
export type { EventRunStatus } from "./domain/EventRun";
export type { DuelResolution } from "./domain/ReservedDuelRecord";
export { BOT_SEAT, PLAYER_SEAT, resolveDuelRecord } from "./domain/ReservedDuelRecord";
export { randomPickIndex } from "./domain/WaveRival";
export type { PickIndex } from "./domain/WaveRival";

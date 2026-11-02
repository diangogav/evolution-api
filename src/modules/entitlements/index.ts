// Public surface of the entitlements module. Other modules import from here, never from
// its folders; see the module boundaries section of docs/architecture.md.

export { EntitlementsGatekeeper } from "./application/EntitlementsGatekeeper";
export { GrantCosmeticToUser } from "./application/GrantCosmeticToUser";
export { EntitlementSource } from "./domain/EntitlementSource";

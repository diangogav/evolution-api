export enum CosmeticTier {
	STANDARD = "STANDARD",
	REGISTERED = "REGISTERED",
	DONOR = "DONOR",
	// Ranks above every user tier the gatekeeper can assign, so no tier ever grants it.
	// Access to an EXCLUSIVE cosmetic comes solely from a per-user COSMETIC entitlement.
	EXCLUSIVE = "EXCLUSIVE",
}

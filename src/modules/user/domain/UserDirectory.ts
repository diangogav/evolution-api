// Resolves a public username to its user id. Loadout, emote bars, entitlements and event
// runs only need this single lookup from the shared user data, so they depend on this
// narrow port rather than the whole user repository.
export interface UserDirectory {
	findUserIdByUsername(username: string): Promise<string | null>;
}

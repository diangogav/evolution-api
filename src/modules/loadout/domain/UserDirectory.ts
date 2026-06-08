// Resolves a public username to its user id. Loadout only needs this single lookup
// from the shared user data, so it depends on this narrow port rather than the whole
// user repository.
export interface UserDirectory {
	findUserIdByUsername(username: string): Promise<string | null>;
}

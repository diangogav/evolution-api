import type { RevokedSessions } from "../../../../src/modules/auth/domain/RevokedSessions";

/** Revoked sign-ins held in memory; nothing expires, since a test never outlives a JWT. */
export class InMemoryRevokedSessions implements RevokedSessions {
	readonly ids = new Set<string>();

	async markRevoked(familyIds: readonly string[]): Promise<void> {
		for (const familyId of familyIds) this.ids.add(familyId);
	}

	async isRevoked(familyId: string): Promise<boolean> {
		return this.ids.has(familyId);
	}
}

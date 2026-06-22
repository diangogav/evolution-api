import { cosmeticsDataSource } from "../cosmetics-data-source";
import { CosmeticPostgresRepository } from "../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { Entitlement } from "../modules/entitlements/domain/Entitlement";
import { EntitlementSource } from "../modules/entitlements/domain/EntitlementSource";
import { GrantType } from "../modules/entitlements/domain/GrantType";
import { EntitlementPostgresRepository } from "../modules/entitlements/infrastructure/EntitlementPostgresRepository";

// Grants a specific cosmetic to a single user via a per-user COSMETIC entitlement. This is
// the only access path for EXCLUSIVE-tier cosmetics (no user tier grants them). Idempotent:
// re-running for the same user/cosmetic does not create a duplicate grant.
//
// Usage (all arguments are required — no defaults):
//   bun run src/scripts/assign-cosmetic.ts <userId> <assetRef> <source>
//
//   userId    the target user's id (users.id is varchar in the shared schema)
//   assetRef  R2 folder prefix of the cosmetic (e.g. companions/terminator/)
//   source    EntitlementSource: REGISTRATION | DONATION | PURCHASE | CAMPAIGN
//
// Example:
//   bun run src/scripts/assign-cosmetic.ts 1a2b3c companions/terminator/ CAMPAIGN

const USAGE = "Usage: bun run src/scripts/assign-cosmetic.ts <userId> <assetRef> <source>";

async function main(): Promise<void> {
	const [userId, assetRef, sourceArg] = process.argv.slice(2);

	if (!userId) {
		throw new Error(`userId is required. ${USAGE}`);
	}

	if (!assetRef) {
		throw new Error(`assetRef is required. ${USAGE}`);
	}

	if (!sourceArg) {
		throw new Error(`source is required. ${USAGE}`);
	}

	const source = sourceArg as EntitlementSource;
	if (!Object.values(EntitlementSource).includes(source)) {
		throw new Error(
			`Invalid source "${sourceArg}". Valid values: ${Object.values(EntitlementSource).join(", ")}`,
		);
	}

	await cosmeticsDataSource.initialize();

	try {
		const cosmetics = new CosmeticPostgresRepository();
		const all = await cosmetics.findAll();
		const cosmetic = all.find((c) => c.assetRef === assetRef);

		if (!cosmetic) {
			throw new Error(
				`No cosmetic found with assetRef "${assetRef}". Run \`bun run seed:cosmetics\` first.`,
			);
		}

		const entitlements = new EntitlementPostgresRepository();
		const existing = await entitlements.findByUserId(userId);
		const alreadyGranted = existing.some(
			(e) => e.grantType === GrantType.COSMETIC && e.grantValue === cosmetic.id,
		);

		if (alreadyGranted) {
			console.log(
				`User ${userId} already has cosmetic "${cosmetic.displayName}" (${cosmetic.id}). Nothing to do.`,
			);
			return;
		}

		await entitlements.save(
			Entitlement.create({
				id: crypto.randomUUID(),
				userId,
				grantType: GrantType.COSMETIC,
				grantValue: cosmetic.id,
				source,
				expiresAt: null,
			}),
		);

		console.log(
			`Granted "${cosmetic.displayName}" (${cosmetic.id}) to user ${userId} via ${source}.`,
		);
	} finally {
		await cosmeticsDataSource.destroy();
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

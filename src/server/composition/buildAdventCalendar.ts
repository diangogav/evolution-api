import { ApplyDoorDuel } from "../../modules/advent-calendar/application/ApplyDoorDuel";
import { GetAdventCalendar } from "../../modules/advent-calendar/application/GetAdventCalendar";
import { PayAdventPrize } from "../../modules/advent-calendar/application/PayAdventPrize";
import { RecoverDoor } from "../../modules/advent-calendar/application/RecoverDoor";
import { RequestDoorDuel } from "../../modules/advent-calendar/application/RequestDoorDuel";
import { RollRuneDie } from "../../modules/advent-calendar/application/RollRuneDie";
import { AdventCatalogPostgresRepository } from "../../modules/advent-calendar/infrastructure/AdventCatalogPostgresRepository";
import { AdventDuelPostgresRepository } from "../../modules/advent-calendar/infrastructure/AdventDuelPostgresRepository";
import { DoorProgressPostgresRepository } from "../../modules/advent-calendar/infrastructure/DoorProgressPostgresRepository";
import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { GrantCosmeticToUser } from "../../modules/entitlements";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { BunRedisReservationStore } from "../../modules/reserved-duel/infrastructure/BunRedisReservationStore";
import { ReservedDuelPostgresReader } from "../../modules/reserved-duel/infrastructure/ReservedDuelPostgresReader";
import { CosmeticsTransactionRunner } from "../../modules/rewards/infrastructure/CosmeticsTransactionRunner";
import { EssenceLedgerPostgresRepository } from "../../modules/rewards/infrastructure/EssenceLedgerPostgresRepository";
import { UserDirectoryPostgresRepository } from "../../modules/user/infrastructure/UserDirectoryPostgresRepository";
import { redisClient } from "../../shared/redis/redisClient";

// Wires the advent calendar use cases to the adapters of the modules they depend on
// (rewards, entitlements, catalog, reserved-duel). It lives in the composition root because
// it needs those modules' Postgres adapters.
export function buildAdventCalendar() {
	const catalog = new AdventCatalogPostgresRepository();
	const doors = new DoorProgressPostgresRepository();
	const duels = new AdventDuelPostgresRepository(new ReservedDuelPostgresReader());
	const ledger = new EssenceLedgerPostgresRepository();
	const transactions = new CosmeticsTransactionRunner();
	const payPrize = new PayAdventPrize(
		ledger,
		new GrantCosmeticToUser(
			new CosmeticPostgresRepository(),
			new EntitlementPostgresRepository(),
			new UserDirectoryPostgresRepository(),
		),
	);
	const applyDuel = new ApplyDoorDuel(doors, duels, payPrize);

	return {
		getCalendar: new GetAdventCalendar(
			catalog,
			doors,
			applyDuel,
			ledger,
			transactions,
			new CosmeticPostgresRepository(),
			createR2AssetUrlSigner(),
		),
		requestDoorDuel: new RequestDoorDuel(
			catalog,
			doors,
			duels,
			new BunRedisReservationStore(redisClient),
			applyDuel,
			transactions,
		),
		rollRuneDie: new RollRuneDie(catalog, doors, applyDuel, payPrize, ledger, transactions),
		recoverDoor: new RecoverDoor(catalog, doors, applyDuel, ledger, transactions),
	};
}

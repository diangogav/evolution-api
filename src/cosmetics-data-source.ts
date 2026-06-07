import { join } from "path";
import { DataSource, DataSourceOptions } from "typeorm";

import { config } from "./evolution-types/src/config";
import { CosmeticEntity } from "./modules/catalog/infrastructure/CosmeticEntity";
import { EntitlementEntity } from "./modules/entitlements/infrastructure/EntitlementEntity";
import { UserLoadoutEntity } from "./modules/loadout/infrastructure/UserLoadoutEntity";

// Cosmetics owns its own DataSource and migration history, isolated from the shared
// schema in evolution-types. It points at the same Postgres but tracks migrations in
// its own table (`cosmetics_migrations`), so the shared `migrations` table — run by
// the game server — never sees these changes. It only knows about cosmetics tables;
// the foreign key to users(id) is declared in raw SQL inside the migration, so this
// DataSource never touches the shared `users` table.
const options: DataSourceOptions = {
	type: "postgres",
	host: config.postgres.host,
	port: config.postgres.port,
	username: config.postgres.username,
	password: config.postgres.password,
	database: config.postgres.database,
	synchronize: false,
	logging: true,
	entities: [CosmeticEntity, UserLoadoutEntity, EntitlementEntity],
	subscribers: [],
	migrations: [join(__dirname, "/migrations/*.ts")],
	migrationsTableName: "cosmetics_migrations",
};

export const cosmeticsDataSource = new DataSource(options);

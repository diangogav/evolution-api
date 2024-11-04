import { DataSource } from "typeorm";

import { dataSource } from "../../../../evolution-types/src/data-source";
import { Logger } from "../../../logger/domain/Logger";
import { Database } from "../../domain/Database";

export class PostgresTypeORM implements Database {
	private readonly dataSource: DataSource;

	constructor(private readonly logger: Logger) {
		this.dataSource = dataSource;
	}

	async connect(): Promise<void> {
		this.logger.info("Connecting to postgres database");
		await this.dataSource.initialize();
		this.logger.info("Connected to postgres database");
	}

	async close(): Promise<void> {
		await this.dataSource.destroy();
	}
}

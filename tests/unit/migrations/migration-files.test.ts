import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Static checks on src/migrations, the API-owned migrations the cosmetics DataSource
// runs. TypeORM orders them by timestamp and records each one by its `name`, so a
// repeated timestamp makes the order depend on file names and a repeated name makes a
// migration look applied when it is not. Applied migrations are never renamed: TypeORM
// would run them again.

const MIGRATIONS_DIR = join(import.meta.dir, "../../../src/migrations");

// Already applied in production with a shared timestamp. Fixed for good: no entry is
// ever added here.
const APPLIED_SHARED_TIMESTAMPS = ["1781800000000"];

const FILE_PATTERN = /^(\d{13})-[a-z0-9][a-z0-9_-]*\.ts$/;
const NAME_PATTERN = /\bname = "([A-Z][A-Za-z0-9]*?)(\d{13})"/;

const migrations = readdirSync(MIGRATIONS_DIR)
	.filter((file) => file.endsWith(".ts"))
	.map((file) => {
		const source = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
		const name = source.match(NAME_PATTERN);
		return {
			file,
			fileTimestamp: file.match(FILE_PATTERN)?.[1],
			name: name ? `${name[1]}${name[2]}` : undefined,
			nameTimestamp: name?.[2],
		};
	});

const repeated = (values: string[]) =>
	[...new Set(values.filter((value, index) => values.indexOf(value) !== index))].sort();

describe("API-owned migration files", () => {
	it("names every file <13-digit timestamp>-<description>.ts", () => {
		expect(
			migrations.filter(({ fileTimestamp }) => !fileTimestamp).map(({ file }) => file),
		).toEqual([]);
	});

	it("declares a name that ends with the file's timestamp", () => {
		const mismatched = migrations
			.filter(({ fileTimestamp, nameTimestamp }) => fileTimestamp !== nameTimestamp)
			.map(({ file, name }) => `${file} -> ${name ?? "no name"}`);

		expect(mismatched).toEqual([]);
	});

	it("gives every migration its own name", () => {
		expect(repeated(migrations.map(({ name }) => name ?? ""))).toEqual([]);
	});

	it("gives every migration its own timestamp, except the pair already applied", () => {
		expect(repeated(migrations.map(({ fileTimestamp }) => fileTimestamp ?? ""))).toEqual(
			APPLIED_SHARED_TIMESTAMPS,
		);
	});
});

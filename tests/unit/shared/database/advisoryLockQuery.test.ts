import { describe, expect, it } from "bun:test";

import { LADDER_ADVISORY_LOCK_QUERY } from "../../../../src/shared/database/advisoryLockQuery";

describe("LADDER_ADVISORY_LOCK_QUERY", () => {
	it("pins the exact length-prefixed SQL the server's ladder advisory lock uses", () => {
		expect(LADDER_ADVISORY_LOCK_QUERY).toBe(
			"SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || length($2)::text || ':' || $2 || ':' || $3, 0))",
		);
	});

	it("does not use the pipe-joined encoding", () => {
		expect(LADDER_ADVISORY_LOCK_QUERY).not.toContain("'|'");
	});
});

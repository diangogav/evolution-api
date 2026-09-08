// Length-prefixed encoding for a (userId, rankId, season) ladder key. Must
// stay byte-identical in meaning to the game server's own advisory lock
// query (`EDOpro-server-ts/src/shared/stats/infrastructure/advisoryLockQuery.ts`):
// both sides call `pg_advisory_xact_lock(hashtextextended(...))` against the
// same three-part key, so a live match's ladder credit and this API's
// annul/un-annul/reversal writes for the same ladder genuinely serialize
// instead of taking two different locks. A plain "a|b|c" join is not
// injective when a value contains the delimiter — the length prefix on the
// middle field keeps the concatenation unambiguous.
export const LADDER_ADVISORY_LOCK_QUERY = `SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || length($2)::text || ':' || $2 || ':' || $3, 0))`;

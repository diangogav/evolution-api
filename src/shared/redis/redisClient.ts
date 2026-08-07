import { RedisClient } from "bun";

import { config } from "../../config";

// Single shared Redis client for the whole app. Bun's RedisClient connects
// lazily (on first command), so the boot sequence in src/index.ts calls
// connect() explicitly to fail-fast if Redis is unreachable at startup.
export const redisClient = new RedisClient(config.redis.url);

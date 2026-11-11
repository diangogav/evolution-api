import { createHash } from "node:crypto";

export const MAX_PUSH_TOPIC_LENGTH = 32;

/**
 * A push topic for a key of any length and alphabet: the push service replaces a pending
 * message with a newer one of the same topic, and accepts at most 32 characters of the
 * URL-safe base64 alphabet. A SHA-256 digest truncated to 32 base64url characters keeps
 * 192 bits, so distinct keys never collide in practice.
 */
export function pushTopic(namespace: string, key: string): string {
	return createHash("sha256")
		.update(`${namespace}:${key}`)
		.digest("base64url")
		.slice(0, MAX_PUSH_TOPIC_LENGTH);
}

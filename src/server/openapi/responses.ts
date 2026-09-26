import { type TSchema, t } from "elysia";

// Builders for `detail.responses`. They only document the contract; runtime
// validation stays in each route's `response` option.

/** Errors mapped in the server `onError` reach clients as their plain-text message. */
export const ErrorSchema = t.String({ description: "Error message, sent as plain text" });

/**
 * Body Elysia sends with 422 when a request fails validation. Production
 * builds only send `type`, `on` and `found`.
 */
export const ValidationErrorSchema = t.Object({
	type: t.Literal("validation"),
	on: t.String({ description: "Request part that failed: body, query, params or headers" }),
	property: t.Optional(t.String()),
	message: t.Optional(t.String()),
	summary: t.Optional(t.String()),
	expected: t.Optional(t.Unknown()),
	found: t.Optional(t.Unknown()),
	errors: t.Optional(t.Array(t.Unknown())),
});

const ERROR_DESCRIPTIONS = {
	400: "Invalid argument",
	401: "Missing or invalid credentials",
	403: "Not allowed for this account",
	404: "Resource not found",
	409: "Conflicts with the current state",
	422: "Request failed validation",
} as const;

type ErrorStatus = keyof typeof ERROR_DESCRIPTIONS;

type DocumentedResponse = {
	description: string;
	content?: Record<string, { schema: TSchema; example?: unknown }>;
};

export function jsonOk(
	schema: TSchema,
	description: string,
	example?: unknown,
): DocumentedResponse {
	const media = example === undefined ? { schema } : { schema, example };
	return { description, content: { "application/json": media } };
}

export function emptyOk(description: string): DocumentedResponse {
	return { description };
}

export function errorResponses<S extends ErrorStatus>(
	...statuses: S[]
): Record<S, Required<DocumentedResponse>> {
	const responses = {} as Record<S, Required<DocumentedResponse>>;
	for (const status of statuses) {
		responses[status] = {
			description: ERROR_DESCRIPTIONS[status],
			content:
				status === 422
					? { "application/json": { schema: ValidationErrorSchema } }
					: { "text/plain": { schema: ErrorSchema } },
		};
	}
	return responses;
}

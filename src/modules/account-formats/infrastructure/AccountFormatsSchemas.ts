import { t } from "elysia";

import { ACCOUNT_FORMATS } from "../domain/AccountFormats";

export const AccountFormatSchema = t.Union(
	ACCOUNT_FORMATS.map((format) => t.Literal(format)),
	{ description: "Format id" },
);

export const MyFormatsSchema = t.Object({
	formats: t.Union([t.Array(AccountFormatSchema), t.Null()], {
		description:
			"Formats the player chose, in catalogue order. Null when the player never chose; an empty list is a choice of none.",
	}),
});

export const SavedFormatsSchema = t.Object({
	formats: t.Array(AccountFormatSchema, {
		description: "The stored choice: deduplicated, in catalogue order",
	}),
});

export const SaveMyFormatsBodySchema = t.Object({
	formats: t.Array(AccountFormatSchema, {
		description: "Format ids; order and repeats do not matter",
	}),
});

import { t } from "elysia";

import { EntitlementSource } from "../domain/EntitlementSource";

/** Response of POST /admin/cosmetics/{id}/grants. */
export const CosmeticGrantSchema = t.Object({
	cosmeticId: t.String(),
	userId: t.String(),
	username: t.String(),
	source: t.Enum(EntitlementSource),
	created: t.Boolean({ description: "False when the user already held this grant" }),
});

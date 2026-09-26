import { t } from "elysia";

/** Response of POST /game-tickets. */
export const GameTicketSchema = t.Object({
	ticket: t.String({
		description: "Single-use UUID the game server redeems, valid for 30 seconds",
	}),
});

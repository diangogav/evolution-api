import swagger from "@elysiajs/swagger";

import packageJson from "../../package.json";

const DESCRIPTION = [
	"Backend of the Evolution YGO platform: player accounts, ranked play and tiers, tournaments, cosmetics and moderation.",
	"",
	"Every endpoint lives under the base path `/api/v1`.",
	"",
	"Endpoints marked with a lock require a JWT sent as `Authorization: Bearer <token>`. Obtain it from the login or register endpoints under Authentication. Administration endpoints additionally require an account with the admin role.",
].join("\n");

const TAGS = [
	{
		name: "Authentication",
		description: "Registration, login, password recovery and account password management",
	},
	{
		name: "User Management",
		description: "Player profiles, statistics, match history, username and game password",
	},
	{
		name: "Leaderboard",
		description: "Season rankings, player of the week and the ranked tier catalog",
	},
	{ name: "Ranked", description: "Tickets that admit authenticated players into ranked games" },
	{ name: "Statistics", description: "Global and historical duel statistics" },
	{ name: "Ban Lists", description: "Ban lists played during each season" },
	{
		name: "Tournaments",
		description: "Callbacks from the tournaments service when a tournament completes",
	},
	{
		name: "Lightning Tournaments",
		description: "Lightning tournament listing, ranking, creation, entries and enrollment",
	},
	{ name: "Bracket Management", description: "Tournament bracket generation and retrieval" },
	{ name: "Match Management", description: "Tournament match results and their annulment" },
	{ name: "Cosmetics", description: "Cosmetics catalog, entitlements and player loadouts" },
	{ name: "User Bans", description: "Ban, unban and ban history of players (admin only)" },
	{
		name: "Match Moderation",
		description: "Batch annulment and reinstatement of ranked matches (admin only)",
	},
	{
		name: "Cosmetics Admin",
		description: "Cosmetic publishing and grants for the backoffice (admin only)",
	},
];

const TAG_GROUPS = [
	{ name: "Account", tags: ["Authentication", "User Management"] },
	{ name: "Ranked", tags: ["Leaderboard", "Ranked", "Statistics", "Ban Lists"] },
	{
		name: "Tournaments",
		tags: ["Tournaments", "Lightning Tournaments", "Bracket Management", "Match Management"],
	},
	{ name: "Cosmetics", tags: ["Cosmetics"] },
	{ name: "Administration", tags: ["User Bans", "Match Moderation", "Cosmetics Admin"] },
];

type SwaggerDocumentation = NonNullable<Parameters<typeof swagger>[0]>["documentation"];

// The OpenAPI types do not know the x-tagGroups extension, so it is added
// through an intersection instead of an inline literal.
const DOCUMENTATION: SwaggerDocumentation & { "x-tagGroups": typeof TAG_GROUPS } = {
	info: {
		title: "Evolution API",
		version: packageJson.version,
		description: DESCRIPTION,
	},
	servers: [
		{ url: "https://api.evolutionygo.com", description: "Production" },
		{ url: "http://localhost:3000", description: "Local development" },
	],
	tags: TAGS,
	// Scalar groups the sidebar tags by domain with this extension.
	"x-tagGroups": TAG_GROUPS,
	components: {
		securitySchemes: {
			bearerAuth: {
				type: "http",
				scheme: "bearer",
				bearerFormat: "JWT",
				description: "JWT returned by the login and register endpoints",
			},
		},
	},
};

export function createSwagger() {
	return swagger({ documentation: DOCUMENTATION });
}

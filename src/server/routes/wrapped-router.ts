import { Elysia, t } from "elysia";
import { bearer } from "@elysiajs/bearer";
import { rateLimit } from "elysia-rate-limit";
import { WrappedController, NotFoundError, ValidationError } from "../../modules/wrapped/infrastructure/WrappedController";
import { JWT } from "../../shared/JWT";
import { config } from "../../config";
import { UnauthorizedError } from "../../shared/errors/UnauthorizedError";
import { UserProfileRole } from "../../evolution-types/src/types/UserProfileRole";

const controller = new WrappedController();
const jwt = new JWT(config.jwt);

/**
 * Authorizes access to wrapped data
 * Allows access if user is the owner OR has admin role
 */
function authorizeWrappedAccess(
    bearerToken: string | undefined,
    playerId: string
): void {
    if (!bearerToken) {
        throw new UnauthorizedError("Authentication required to access wrapped data");
    }

    const decoded = jwt.decode(bearerToken) as { id: string; role: string };
    const isOwner = decoded.id === playerId;
    const isAdmin = decoded.role === UserProfileRole.ADMIN;

    if (!isOwner && !isAdmin) {
        throw new UnauthorizedError(
            "You can only access your own wrapped data or must be an admin"
        );
    }
}

export const wrappedRouter = new Elysia()
    .use(bearer())
    .group("/seasons", (app) =>
        app
            .use(
                rateLimit({
                    duration: 60000,
                    max: 10,
                })
            )
            // DEBUG: HTML endpoint (temporary)
            .get(
                "/:seasonId/wrapped/:playerId/html",
                async ({ params, query, set }) => {
                    try {
                        const result = await controller.getData({
                            params: {
                                seasonId: params.seasonId,
                                playerId: params.playerId,
                            },
                        });

                        const { renderTemplate } = await import("../../modules/wrapped/infrastructure/templates/templateRenderer");
                        const locale = (query.locale || "es") as string;
                        const theme = (query.theme === "light" ? "light" : "dark") as "dark" | "light";
                        const html = renderTemplate(result, {
                            locale,
                            theme,
                            includeMatchList: false,
                        });

                        set.headers["Content-Type"] = "text/html";
                        return html;
                    } catch (error) {
                        set.status = 500;
                        return {
                            error: "Failed to generate HTML",
                            details: error instanceof Error ? error.message : "Unknown error"
                        };
                    }
                }
            )
            // PDF endpoint
            .get(
                "/:seasonId/wrapped/:playerId/pdf",
                async ({ params, query, bearer, set }) => {
                    try {
                        // Authorization: Only owner or admin can access
                        authorizeWrappedAccess(bearer, params.playerId);

                        const result = await controller.generatePdf({
                            params: {
                                seasonId: params.seasonId,
                                playerId: params.playerId,
                            },
                            query: {
                                locale: query.locale,
                                theme: query.theme,
                                includeMatchList: query.includeMatchList,
                                singlePage: query.singlePage,
                            },
                        });

                        // Set proper headers for PDF response
                        set.status = 200;
                        set.headers["Content-Type"] = "application/pdf";

                        // Sanitize filename to prevent header injection or filesystem issues
                        const safePlayerName = result.playerName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        const filename = `${safePlayerName}-season-${result.seasonId}-wrapped.pdf`;

                        set.headers["Content-Disposition"] = `inline; filename="${filename}"`;

                        // Caching headers (1 hour cache)

                        set.headers["Cache-Control"] = "public, max-age=3600";
                        set.headers["Last-Modified"] = new Date().toUTCString();

                        // ETag for conditional requests
                        const etag = `"${result.seasonId}-${result.playerId}-${query.locale || 'es'}-${query.theme || 'dark'}"`;
                        set.headers["ETag"] = etag;

                        return result.pdf;
                    } catch (error) {
                        if (error instanceof UnauthorizedError) {
                            set.status = 401;
                            return {
                                error: "UnauthorizedError",
                                message: error.message
                            };
                        }

                        if (error instanceof ValidationError) {
                            set.status = 422; // Unprocessable Entity
                            return {
                                error: "ValidationError",
                                message: error.message,
                                details: {
                                    seasonId: params.seasonId,
                                    playerId: params.playerId
                                }
                            };
                        }

                        if (error instanceof NotFoundError) {
                            set.status = 404; // Not Found
                            return {
                                error: "NotFoundError",
                                message: error.message
                            };
                        }

                        // Internal server error
                        console.error("PDF generation error:", error);
                        set.status = 500;
                        return {
                            error: "InternalServerError",
                            message: "Failed to generate PDF",
                            details: error instanceof Error ? error.message : "Unknown error"
                        };
                    }
                },
                {
                    detail: {
                        tags: ["Season Wrapped"],
                        summary: "Generate season wrapped PDF",
                        description:
                            "Generates a beautiful PDF report with player statistics for a specific season",
                        responses: {
                            200: {
                                description: "PDF generated successfully",
                                content: {
                                    "application/pdf": {
                                        schema: {
                                            type: "string",
                                            format: "binary",
                                        },
                                    },
                                },
                            },
                            401: {
                                description: "Unauthorized - Authentication required or insufficient permissions",
                            },
                            404: {
                                description: "Player or season not found",
                            },
                            422: {
                                description: "Validation error - Invalid season ID or player ID format",
                            },
                            500: {
                                description: "Server error",
                            },
                        },
                        security: [{ bearerAuth: [] }],
                    },
                    params: t.Object({
                        seasonId: t.String({
                            description: "Season ID",
                            examples: ["5"],
                        }),
                        playerId: t.String({
                            description: "Player UUID",
                            examples: ["e3b02258-4c7c-41d6-b317-bc78f52a7e84"],
                        }),
                    }),
                    query: t.Object({
                        locale: t.Optional(
                            t.String({
                                description: "Language code (es or en)",
                                default: "es",
                                examples: ["es", "en"],
                            }),
                        ),
                        theme: t.Optional(
                            t.Union([t.Literal("dark"), t.Literal("light")], {
                                description: "PDF theme",
                                default: "dark",
                                examples: ["dark", "light"],
                            }),
                        ),
                        includeMatchList: t.Optional(
                            t.String({
                                description:
                                    "Include detailed match list (not yet implemented)",
                                default: "false",
                                examples: ["true", "false"],
                            }),
                        ),
                        singlePage: t.Optional(
                            t.String({
                                description:
                                    "Generate single-page compact version (experimental)",
                                default: "false",
                                examples: ["true", "false"],
                            }),
                        ),
                    }),
                },
            )

            // JSON endpoint (for debugging)
            .get(
                "/:seasonId/wrapped/:playerId",
                async ({ params, bearer, set }) => {
                    try {
                        // Authorization: Only owner or admin can access
                        authorizeWrappedAccess(bearer, params.playerId);

                        const data = await controller.getData({
                            params: {
                                seasonId: params.seasonId,
                                playerId: params.playerId,
                            },
                        });

                        // Success response with caching
                        set.status = 200;
                        set.headers["Content-Type"] = "application/json";
                        set.headers["Cache-Control"] = "public, max-age=3600";

                        return data;
                    } catch (error) {
                        if (error instanceof UnauthorizedError) {
                            set.status = 401;
                            return {
                                error: "UnauthorizedError",
                                message: error.message
                            };
                        }

                        if (error instanceof ValidationError) {
                            set.status = 422;
                            return {
                                error: "ValidationError",
                                message: error.message
                            };
                        }

                        if (error instanceof NotFoundError) {
                            set.status = 404;
                            return {
                                error: "NotFoundError",
                                message: error.message
                            };
                        }

                        console.error("Wrapped data fetch error:", error);
                        set.status = 500;
                        return {
                            error: "InternalServerError",
                            message: "Failed to fetch wrapped data",
                            details: error instanceof Error ? error.message : "Unknown error"
                        };
                    }
                },
                {
                    detail: {
                        tags: ["Season Wrapped"],
                        summary: "Get season wrapped data (JSON)",
                        description:
                            "Returns the raw season wrapped data as JSON for debugging and validation",
                        responses: {
                            200: {
                                description: "Data retrieved successfully",
                                content: {
                                    "application/json": {
                                        example: {
                                            playerId: "e3b02258-4c7c-41d6-b317-bc78f52a7e84",
                                            playerName: "PlayerOne",
                                            seasonId: 5,
                                            globalStats: {
                                                totalMatches: 150,
                                                wins: 85,
                                                losses: 65,
                                                winrate: 56.7,
                                            },
                                            banListStats: [],
                                            achievements: [],
                                        },
                                    },
                                },
                            },
                            401: {
                                description: "Unauthorized - Authentication required or insufficient permissions",
                            },
                            404: {
                                description: "Player or season not found",
                            },
                            422: {
                                description: "Validation error - Invalid season ID or player ID format",
                            },
                        },
                        security: [{ bearerAuth: [] }],
                    },
                    params: t.Object({
                        seasonId: t.String({
                            description: "Season ID",
                            examples: ["5"],
                        }),
                        playerId: t.String({
                            description: "Player UUID",
                            examples: ["e3b02258-4c7c-41d6-b317-bc78f52a7e84"],
                        }),
                    }),
                },
            ),
    );

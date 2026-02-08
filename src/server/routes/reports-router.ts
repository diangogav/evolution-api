import { bearer } from "@elysiajs/bearer";
import { Elysia } from "elysia";
import { ReportsController } from "../../modules/reports/infrastructure/ReportsController";
import { JWT } from "../../shared/JWT";
import { config } from "../../config";
import { AuthenticationError } from "../../shared/errors/AuthenticationError";

const jwt = new JWT(config.jwt);

export const reportsRouter = new Elysia()
    .group("/reports", (app) =>
        app
            .use(bearer())
            .get("/wrapped", async (context) => {
                const token = context.bearer;
                if (!token) {
                    throw new AuthenticationError("No token provided");
                }
                const decoded = jwt.decode(token) as { id: string } | null;
                if (!decoded || !decoded.id) {
                    throw new AuthenticationError("Invalid token");
                }

                return new ReportsController().getWrapped({ user: { profile: { id: decoded.id } } });
            }, {
                detail: {
                    tags: ['Reports'],
                    summary: 'Get Player Wrapped Report',
                    description: 'Generates a PDF report of player statistics for seasons 3, 4, and 5.',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: {
                            description: 'PDF Report retrieved successfully',
                            content: {
                                'application/pdf': {}
                            }
                        },
                        401: { description: 'Unauthorized' }
                    }
                }
            })
    );

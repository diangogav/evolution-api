import { GenerateWrappedReport } from "../application/GenerateWrappedReport";
import { ReportsPostgresRepository } from "../infrastructure/ReportsPostgresRepository";

export class ReportsController {
    async getWrapped(context: { user: { profile: { id: string } } }) {
        const userId = context.user.profile.id;
        const generateReport = new GenerateWrappedReport(new ReportsPostgresRepository());

        const pdfBuffer = await generateReport.execute(userId);

        return new Response(pdfBuffer as any, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="evolution-wrapped-${userId}.pdf"`
            }
        });
    }
}

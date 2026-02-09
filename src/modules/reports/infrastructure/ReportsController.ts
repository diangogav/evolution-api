import { GenerateWrappedReport } from "../application/GenerateWrappedReport";
import { ReportsPostgresRepository } from "../infrastructure/ReportsPostgresRepository";
import { PdfMakeGenerator } from "../infrastructure/PdfMakeGenerator";

export class ReportsController {
    async getWrapped(context: { user: { profile: { id: string } } }) {
        const userId = context.user.profile.id;
        const generateReport = new GenerateWrappedReport(
            new ReportsPostgresRepository(),
            new PdfMakeGenerator()
        );

        const pdfBuffer = await generateReport.execute(userId);

        return new Response(pdfBuffer as unknown as BodyInit, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="evolution-wrapped-${userId}.pdf"`
            }
        });
    }
}

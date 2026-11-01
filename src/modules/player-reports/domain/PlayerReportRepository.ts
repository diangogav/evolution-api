import type {
	PlayerReport,
	ReportDetail,
	ReportReceipt,
	ReportStatus,
	ReportableMatch,
	ReviewReportInput,
	SubmitReportInput,
} from "./PlayerReport";

export interface PlayerReportRepository {
	listMatches(input: {
		reporterId: string;
		page: number;
		limit: number;
		now: Date;
	}): Promise<ReportableMatch[]>;
	submit(
		input: SubmitReportInput,
	): Promise<{ outcome: "accepted"; receipt: ReportReceipt } | { outcome: "ineligible" | "quota" }>;
	list(input: { page: number; limit: number; status?: ReportStatus }): Promise<PlayerReport[]>;
	get(id: string): Promise<ReportDetail | null>;
	review(
		input: ReviewReportInput,
	): Promise<{ outcome: "accepted"; report: PlayerReport } | { outcome: "missing" | "conflict" }>;
}

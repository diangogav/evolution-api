export const REPORT_REASONS = [
	"harassment",
	"cheating",
	"stalling",
	"inappropriate_name",
	"other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_STATUSES = ["open", "investigating", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_WINDOW_DAYS = 30;
export const REPORT_DAILY_LIMIT = 5;

export type ReportableMatch = {
	gameId: string;
	date: string;
	banListName: string;
	playerScore: number;
	opponentScore: number;
	opponents: { userId: string; username: string }[];
};
export type ReportReceipt = { id: string; status: ReportStatus; createdAt: string };
export type MatchEvidence = {
	matchId: string;
	gameId: string;
	date: string;
	banListName: string;
	bestOf: number;
	playerScore: number;
	opponentScore: number;
	playerIds: string[];
	opponentIds: string[];
	playerNames: string[];
	opponentNames: string[];
	reporterUsername: string;
	reportedUsername: string;
};
export type PlayerReport = ReportReceipt & {
	reporterId: string;
	reportedUserId: string;
	gameId: string;
	reason: ReportReason;
	details: string;
	context: MatchEvidence;
	updatedAt: string;
	revision: number;
};
export type ReportReview = {
	id: string;
	adminUserId: string;
	fromStatus: ReportStatus;
	toStatus: ReportStatus;
	note: string;
	createdAt: string;
	revision: number;
};
export type ReportDetail = PlayerReport & { reviews: ReportReview[] };
export type SubmitReportInput = {
	reporterId: string;
	gameId: string;
	reportedUserId: string;
	reason: ReportReason;
	details: string;
	now: Date;
};
export type ReviewReportInput = {
	id: string;
	adminUserId: string;
	status: ReportStatus;
	note: string;
	expectedRevision: number;
	now: Date;
};

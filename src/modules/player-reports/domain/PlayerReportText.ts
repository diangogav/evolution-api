import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";

export const REPORT_DETAILS_MIN_LENGTH = 10;
export const REVIEW_NOTE_MIN_LENGTH = 3;
export const REPORT_TEXT_MAX_LENGTH = 2000;

function reportText(value: string, minimum: number, label: string): string {
	const trimmed = value.trim();
	// PostgreSQL char_length counts Unicode code points, not UTF-16 code units.
	const characters = [...trimmed];
	if (
		characters.length < minimum ||
		characters.length > REPORT_TEXT_MAX_LENGTH ||
		characters.some((character) => {
			const code = character.codePointAt(0)!;
			return (
				(code < 32 && !"\t\n\r".includes(character)) ||
				code === 127 ||
				(code >= 0xd800 && code <= 0xdfff)
			);
		})
	) {
		throw new InvalidArgumentError(`Invalid ${label}`);
	}
	return trimmed;
}

export function playerReportDetails(value: string): string {
	return reportText(value, REPORT_DETAILS_MIN_LENGTH, "player report details");
}

export function reviewNote(value: string): string {
	return reportText(value, REVIEW_NOTE_MIN_LENGTH, "review note");
}

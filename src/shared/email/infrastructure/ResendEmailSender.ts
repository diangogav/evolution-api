import { Resend } from "resend";

import { config } from "../../../config";
import { EmailSender } from "../domain/EmailSender";

const resend = new Resend(config.resend.apiKey);

export class ResendEmailSender implements EmailSender {
	async send(email: string, data: { [key: string]: string }): Promise<void> {
		const message = {
			from: config.resend.from,
			to: [email],
			subject: `${data.subject}`,
			html: data.html,
			text: data.text,
		};

		await resend.emails.send(message);
	}
}

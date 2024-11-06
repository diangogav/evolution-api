import sgMail from "@sendgrid/mail";

import { config } from "../../../config";
import { EmailSender } from "../domain/EmailSender";

sgMail.setApiKey(config.sendgrid.apiKey);

export class SengridEmailSender implements EmailSender {
	async send(email: string, data: { [key: string]: string }): Promise<void> {
		const message = {
			from: {
				email: config.sendgrid.from,
			},
			personalizations: [
				{
					to: [
						{
							email,
						},
					],
					dynamic_template_data: {
						username: data.email,
						password: data.password,
					},
				},
			],
			templateId: config.sendgrid.templateId,
		};

		await sgMail.send(message);
	}
}

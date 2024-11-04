import * as dotenv from "dotenv";

dotenv.config();

function ensureEnvVariable(variable: string, variableName: string): string {
	if (!variable) {
		throw new Error(`Environment variable ${variableName} is not set`);
	}

	return variable;
}

export const config = {
	sendgrid: {
		from: ensureEnvVariable(process.env.SENDGRID_FROM_EMAIL as string, "SENDGRID_FROM_EMAIL"),
		templateId: ensureEnvVariable(process.env.SENDGRID_TEMPLATE_ID as string, "SENDGRID_TEMPLATE_ID"),
	},
};
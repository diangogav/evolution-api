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
		apiKey: ensureEnvVariable(process.env.SENDGRID_API_KEY as string, "SENDGRID_API_KEY"),
		from: ensureEnvVariable(process.env.SENDGRID_FROM_EMAIL as string, "SENDGRID_FROM_EMAIL"),
		templateId: ensureEnvVariable(process.env.SENDGRID_TEMPLATE_ID as string, "SENDGRID_TEMPLATE_ID"),
	},
	resend: {
		apiKey: ensureEnvVariable(process.env.RESEND_API_KEY as string, "RESEND_API_KEY"),
		from: ensureEnvVariable(process.env.RESEND_FROM_EMAIL as string, "RESEND_FROM_EMAIL"),
	},
	jwt: {
		secret: ensureEnvVariable(process.env.JWT_SECRET as string, "JWT_SECRET"),
		issuer: ensureEnvVariable(process.env.JWT_ISSUER as string, "JWT_ISSUER"),
	},
	season: Number(ensureEnvVariable(process.env.SEASON as string, "SEASON")),
};

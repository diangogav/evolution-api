import * as dotenv from "dotenv";

dotenv.config();

function ensureEnvVariable(variable: string, variableName: string): string {
	if (!variable) {
		throw new Error(`Environment variable ${variableName} is not set`);
	}

	return variable;
}

const isProduction = process.env.NODE_ENV === "production";

export const config = {
	sendgrid: {
		apiKey: ensureEnvVariable(process.env.SENDGRID_API_KEY as string, "SENDGRID_API_KEY"),
		from: ensureEnvVariable(process.env.SENDGRID_FROM_EMAIL as string, "SENDGRID_FROM_EMAIL"),
		templateId: ensureEnvVariable(
			process.env.SENDGRID_TEMPLATE_ID as string,
			"SENDGRID_TEMPLATE_ID",
		),
	},
	resend: {
		apiKey: ensureEnvVariable(process.env.RESEND_API_KEY as string, "RESEND_API_KEY"),
		from: ensureEnvVariable(process.env.RESEND_FROM_EMAIL as string, "RESEND_FROM_EMAIL"),
	},
	jwt: {
		secret: ensureEnvVariable(process.env.JWT_SECRET as string, "JWT_SECRET"),
		issuer: ensureEnvVariable(process.env.JWT_ISSUER as string, "JWT_ISSUER"),
	},
	redis: {
		url: ensureEnvVariable(process.env.REDIS_URL as string, "REDIS_URL"),
	},
	r2: {
		accessKeyId: ensureEnvVariable(process.env.R2_ACCESS_KEY_ID as string, "R2_ACCESS_KEY_ID"),
		secretAccessKey: ensureEnvVariable(
			process.env.R2_SECRET_ACCESS_KEY as string,
			"R2_SECRET_ACCESS_KEY",
		),
		bucket: ensureEnvVariable(process.env.R2_BUCKET as string, "R2_BUCKET"),
		endpoint: ensureEnvVariable(process.env.R2_ENDPOINT as string, "R2_ENDPOINT"),
		signedUrlTtlSeconds: Number(process.env.R2_SIGNED_URL_TTL ?? "600"),
	},
	season: Number(ensureEnvVariable(process.env.SEASON as string, "SEASON")),
	tournaments: {
		apiUrl: ensureEnvVariable(process.env.TOURNAMENTS_API_URL as string, "TOURNAMENTS_API_URL"),
		webhookUrl: ensureEnvVariable(
			process.env.TOURNAMENTS_WEBHOOK_URL as string,
			"TOURNAMENTS_WEBHOOK_URL",
		),
	},
	passwordRecovery: {
		defaultResetUrl: "https://evolutionygo.com/reset-account-password?token={token}",
		frontends: [
			{
				origin: "https://evolutionygo.com",
				template: "https://evolutionygo.com/reset-account-password?token={token}",
			},
			{
				origin: "https://evoduel.com",
				template: "https://evoduel.com/#/reset-account-password?token={token}",
			},
			...(isProduction
				? []
				: [
						{
							origin: "http://localhost:5173",
							template: "http://localhost:5173/#/reset-account-password?token={token}",
						},
						{
							origin: "http://localhost:4321",
							template: "http://localhost:4321/reset-account-password?token={token}",
						},
					]),
		],
	},
};

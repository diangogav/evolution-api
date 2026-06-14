import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserForgotPassword } from "../../../../../src/modules/user/application/UserForgotPassword";
import { ResetPasswordLinkBuilder } from "../../../../../src/modules/user/domain/ResetPasswordLinkBuilder";
import { User } from "../../../../../src/modules/user/domain/User";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { EmailSender } from "../../../../../src/shared/email/domain/EmailSender";
import { JWT } from "../../../../../src/shared/JWT";
import { Logger } from "../../../../../src/shared/logger/domain/Logger";
import { Pino } from "../../../../../src/shared/logger/infrastructure/Pino";
import { UserMother } from "../mothers/UserMother";

describe("UserForgotPassword", () => {
	let repository: UserRepository;
	let emailSender: EmailSender;
	let jwt: JWT;
	let logger: Logger;
	let resetLinkBuilder: ResetPasswordLinkBuilder;
	let forgot: UserForgotPassword;
	let user: User;

	beforeEach(() => {
		repository = {
			create: async () => undefined,
			findByEmailOrUsername: async () => null,
			findByEmail: async () => null,
			findById: async () => null,
			update: async () => undefined,
			updateParticipantId: async () => undefined,
			findByParticipantId: async () => null,
		};
		emailSender = { send: async () => undefined };
		jwt = new JWT({ issuer: "issuer", secret: "secret" });
		logger = new Pino();
		resetLinkBuilder = new ResetPasswordLinkBuilder(
			[
				{ origin: "https://evolutionygo.com", template: "https://evolutionygo.com/reset-password?token={token}" },
				{ origin: "https://evoduel.com", template: "https://evoduel.com/#/reset-account-password?token={token}" },
			],
			"https://evolutionygo.com/reset-password?token={token}",
		);
		forgot = new UserForgotPassword(repository, emailSender, jwt, logger, resetLinkBuilder);

		user = UserMother.create();
	});

	it("emails the evoduel account-password reset link when the request comes from evoduel", async () => {
		spyOn(repository, "findByEmail").mockResolvedValue(user);
		const sendSpy = spyOn(emailSender, "send").mockResolvedValue();

		await forgot.forgotPassword({ email: user.email, origin: "https://evoduel.com", referer: null });

		expect(sendSpy).toHaveBeenCalledTimes(1);
		const emailData = sendSpy.mock.calls[0][1];
		expect(emailData.html).toContain("https://evoduel.com/#/reset-account-password?token=");
		expect(emailData.text).toContain("https://evoduel.com/#/reset-account-password?token=");
	});

	it("preserves the evolutionygo reset-password link when the request only carries a referer", async () => {
		spyOn(repository, "findByEmail").mockResolvedValue(user);
		const sendSpy = spyOn(emailSender, "send").mockResolvedValue();

		await forgot.forgotPassword({ email: user.email, origin: null, referer: "https://evolutionygo.com/" });

		const emailData = sendSpy.mock.calls[0][1];
		expect(emailData.html).toContain("https://evolutionygo.com/reset-password?token=");
	});

	it("does not reveal whether the email exists and skips sending when it is not registered", async () => {
		spyOn(repository, "findByEmail").mockResolvedValue(null);
		const sendSpy = spyOn(emailSender, "send").mockResolvedValue();

		const result = await forgot.forgotPassword({ email: "ghost@example.com" });

		expect(result.message).toBe("Email sent successfully");
		expect(sendSpy).not.toHaveBeenCalled();
	});

	it("propagates an error when the email fails to send", async () => {
		spyOn(repository, "findByEmail").mockResolvedValue(user);
		spyOn(emailSender, "send").mockRejectedValue(new Error("smtp down"));

		expect(
			forgot.forgotPassword({ email: user.email, origin: "https://evoduel.com" }),
		).rejects.toThrow("Error sending email");
	});
});

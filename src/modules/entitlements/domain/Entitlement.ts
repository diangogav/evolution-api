import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { EntitlementSource } from "./EntitlementSource";
import { GrantType } from "./GrantType";

// A granted access right (a tier or a specific cosmetic). `source` records where it
// came from (registration, donation, purchase, campaign) so it can be revoked or
// reasoned about independently. `canUse()` lives in the entitlements policy (A6).
export class Entitlement {
	private constructor(
		public readonly id: string,
		public readonly userId: string,
		public readonly grantType: GrantType,
		public readonly grantValue: string,
		public readonly source: EntitlementSource,
		public readonly expiresAt: Date | null,
	) {}

	static create({
		id,
		userId,
		grantType,
		grantValue,
		source,
		expiresAt,
	}: {
		id: string;
		userId: string;
		grantType: GrantType;
		grantValue: string;
		source: EntitlementSource;
		expiresAt: Date | null;
	}): Entitlement {
		if (!grantValue.trim()) {
			throw new InvalidArgumentError("grantValue cannot be empty");
		}

		return new Entitlement(id, userId, grantType, grantValue, source, expiresAt);
	}

	static from(data: {
		id: string;
		userId: string;
		grantType: GrantType;
		grantValue: string;
		source: EntitlementSource;
		expiresAt: Date | null;
	}): Entitlement {
		return new Entitlement(
			data.id,
			data.userId,
			data.grantType,
			data.grantValue,
			data.source,
			data.expiresAt,
		);
	}

	isActiveAt(date: Date): boolean {
		return this.expiresAt === null || this.expiresAt.getTime() > date.getTime();
	}

	toPrimitives(): {
		id: string;
		userId: string;
		grantType: GrantType;
		grantValue: string;
		source: EntitlementSource;
		expiresAt: Date | null;
	} {
		return {
			id: this.id,
			userId: this.userId,
			grantType: this.grantType,
			grantValue: this.grantValue,
			source: this.source,
			expiresAt: this.expiresAt,
		};
	}
}

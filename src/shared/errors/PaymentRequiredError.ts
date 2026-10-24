// The caller cannot afford the operation (not enough essence). Maps to 402.
export class PaymentRequiredError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PaymentRequiredError";
	}
}

export interface EmailSender {
	send(email: string, data: { [key: string]: string }): Promise<void>;
}

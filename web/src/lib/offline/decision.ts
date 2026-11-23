/** The sync stopped because the server already has a decision, or the learner must choose. */
export class OutboxDecision extends Error {
	readonly choice: "ask" | "server";
	readonly serverId: string | null;
	readonly serverNote: string | null;

	constructor(
		choice: "ask" | "server",
		serverId: string | null = null,
		serverNote: string | null = null,
	) {
		super(choice);
		this.name = "OutboxDecision";
		this.choice = choice;
		this.serverId = serverId;
		this.serverNote = serverNote;
	}
}

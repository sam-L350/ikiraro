import type { Database } from "../../db";
import { domainEvents, type JsonValue, systemAuditLogs } from "../../db/schema";

export type DbWriter = Pick<Database, "insert">;

export type AuditEntry = {
	actorId?: number;
	action: string;
	targetType?: string;
	targetId?: string;
	ipAddress?: string;
	metadata?: JsonValue;
};

export type DomainEvent = {
	name: string;
	payload: JsonValue;
};

/** Insert an audit row on the caller's transaction. */
export async function writeAudit(
	writer: DbWriter,
	entry: AuditEntry,
): Promise<void> {
	await writer.insert(systemAuditLogs).values({
		actorId: entry.actorId,
		action: entry.action,
		targetType: entry.targetType,
		targetId: entry.targetId,
		ipAddress: entry.ipAddress,
		metadata: entry.metadata,
	});
}

/** Insert a domain event on the caller's transaction. */
export async function writeEvent(
	writer: DbWriter,
	event: DomainEvent,
): Promise<string> {
	const [row] = await writer
		.insert(domainEvents)
		.values({
			name: event.name,
			payload: event.payload,
		})
		.returning({ id: domainEvents.id });
	if (!row) throw new Error("The event was not stored.");
	return row.id;
}

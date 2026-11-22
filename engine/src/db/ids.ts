/** Server-side id for rows created online. Offline clients generate their own. */
export function newId(): string {
	return crypto.randomUUID();
}

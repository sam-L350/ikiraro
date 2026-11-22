/** Returns `2507...` or null when the value is not a Rwandan mobile number. */
export function normalizeRwandanPhone(input: string): string | null {
	const digits = input.replace(/[^\d]/g, "");
	let local = digits;
	if (local.startsWith("250") && local.length === 12) local = local.slice(3);
	else if (local.startsWith("0") && local.length === 10) local = local.slice(1);
	if (local.length !== 9 || !local.startsWith("7")) return null;
	return `250${local}`;
}

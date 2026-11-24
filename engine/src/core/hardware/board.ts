/** Initials only. A missing name does not fall back to an email. */
export function boardInitials(name: string | null): string | null {
	if (!name) return null;
	const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 3);
	if (parts.length === 0) return null;
	const letters = parts.map((part) => part[0] ?? "").join("");
	const initials = letters.toLocaleUpperCase();
	return initials.length > 0 ? initials : null;
}

/** Reporting bands. These are not eligibility rules. */
export function ageBand(
	dateOfBirth: string | null,
	today = new Date(),
): string | null {
	if (!dateOfBirth) return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	let age = today.getUTCFullYear() - year;
	const beforeBirthday =
		today.getUTCMonth() + 1 < month ||
		(today.getUTCMonth() + 1 === month && today.getUTCDate() < day);
	if (beforeBirthday) age -= 1;
	if (age < 0 || age > 120) return null;
	if (age < 18) return "under 18";
	if (age < 25) return "18-24";
	if (age < 35) return "25-34";
	return "35 and over";
}

/** A share of the one threshold that was stored. No threshold means no percent. */
export function progressToward(
	points: number,
	minimum: number | null,
): number | null {
	if (minimum === null || minimum <= 0) return null;
	const share = Math.min(1, Math.max(0, points) / minimum);
	return Math.round(share * 100);
}

/** A group smaller than 10 is left out. The floor is a disclosure rule. */
export function visibleGroups<T extends { registered: number }>(
	rows: T[],
): T[] {
	return rows.filter((row) => row.registered >= 10);
}

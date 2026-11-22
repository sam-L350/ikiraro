import { errors } from "../api/error";

/** A real calendar date, not in the future, as `YYYY-MM-DD`. */
export function parseDateOfBirth(value: string, today = new Date()): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
	if (!match) {
		throw errors.badRequest("Enter a date of birth.", {
			reason: "invalid_date",
		});
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const utc = new Date(Date.UTC(year, month - 1, day));
	const current = Date.UTC(
		today.getUTCFullYear(),
		today.getUTCMonth(),
		today.getUTCDate(),
	);
	const real =
		utc.getUTCFullYear() === year &&
		utc.getUTCMonth() === month - 1 &&
		utc.getUTCDate() === day &&
		utc.getTime() <= current;
	if (!real) {
		throw errors.badRequest("Enter a date of birth.", {
			reason: "invalid_date",
		});
	}
	return `${match[1]}-${match[2]}-${match[3]}`;
}

/** True until the day the person turns 18. */
export function isUnder18(dateOfBirth: string, today = new Date()): boolean {
	const parsed = parseDateOfBirth(dateOfBirth, today);
	const [year, month, day] = parsed.split("-").map(Number) as [
		number,
		number,
		number,
	];
	const adultOn = Date.UTC(year + 18, month - 1, day);
	const current = Date.UTC(
		today.getUTCFullYear(),
		today.getUTCMonth(),
		today.getUTCDate(),
	);
	return adultOn > current;
}

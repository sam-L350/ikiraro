type Bucket = {
	count: number;
	resetAt: number;
};

const buckets = new Map<string, Bucket>();

let clock: () => number = () => Date.now();

/** Tests pin the clock. Production uses the real clock. */
export function setTestClock(next: () => number): void {
	clock = next;
}

export function resetTestClock(): void {
	clock = () => Date.now();
}

export function resetRateLimits(): void {
	buckets.clear();
}

export function consumeRateLimit(input: {
	key: string;
	limit: number;
	windowMs: number;
}): { ok: boolean; remaining: number } {
	const now = clock();
	const current = buckets.get(input.key);
	if (!current || now >= current.resetAt) {
		buckets.set(input.key, { count: 1, resetAt: now + input.windowMs });
		return { ok: true, remaining: input.limit - 1 };
	}
	if (current.count >= input.limit) {
		return { ok: false, remaining: 0 };
	}
	current.count += 1;
	return { ok: true, remaining: input.limit - current.count };
}

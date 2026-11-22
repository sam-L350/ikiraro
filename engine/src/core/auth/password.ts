/** Argon2id. The hash stays on the server. */
export async function hashPassword(password: string): Promise<string> {
	return Bun.password.hash(password, { algorithm: "argon2id" });
}

export async function verifyPassword(
	password: string,
	passwordHash: string,
): Promise<boolean> {
	return Bun.password.verify(password, passwordHash);
}

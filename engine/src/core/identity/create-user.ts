import type { Database } from "../../db";
import { digitalPassports, users } from "../../db/schema";

type UserWriter = Pick<Database, "insert">;

export type NewIdentity = {
	email: string;
	phone?: string;
	name?: string | null;
	picture?: string | null;
	createdByUserId?: number;
	/** Omit to mark the account active. Registration passes null until the OTP. */
	activatedAt?: Date | null;
};

export type CreatedIdentity = {
	userId: number;
	passportId: string;
};

/** Insert a user and that user's passport. Caller owns the transaction. */
export async function insertUserWithPassport(
	writer: UserWriter,
	input: NewIdentity,
): Promise<CreatedIdentity> {
	const [user] = await writer
		.insert(users)
		.values({
			email: input.email,
			phone: input.phone,
			name: input.name,
			picture: input.picture,
			createdByUserId: input.createdByUserId,
			activatedAt:
				input.activatedAt === undefined ? new Date() : input.activatedAt,
		})
		.returning({ id: users.id });
	if (!user) throw new Error("Failed to create user");

	const [passport] = await writer
		.insert(digitalPassports)
		.values({ userId: user.id })
		.returning({ id: digitalPassports.id });
	if (!passport) throw new Error("Failed to create passport");

	return { userId: user.id, passportId: passport.id };
}

/** Create a user and passport together. A failure stores neither row. */
export async function createUserWithPassport(
	database: Pick<Database, "transaction">,
	input: NewIdentity,
): Promise<CreatedIdentity> {
	return database.transaction(async (tx) => insertUserWithPassport(tx, input));
}

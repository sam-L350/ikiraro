import { clientIp } from "../../../../core/http/client-ip";
import {
	type CredentialCheck,
	checkCredential,
} from "../../../../core/learning/credentials";
import { db } from "../../../../db";

/**
 * Public. A passport token or a badge token comes in.
 * Authenticity and revocation go out. The lookup is rate-limited.
 */
export async function getCredentialCheck(input: {
	token: string;
}): Promise<CredentialCheck> {
	return checkCredential(db, { token: input.token, ip: clientIp() });
}

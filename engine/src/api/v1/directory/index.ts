import {
	type DirectoryCenter,
	searchDirectory,
} from "../../../core/geography/directory";
import { db } from "../../../db";

/** Active centers a learner or a partner can find. No sign-in is required. */
export async function getDirectory(input: {
	q?: string;
	latitude?: number;
	longitude?: number;
}): Promise<{ items: DirectoryCenter[] }> {
	return searchDirectory(db, input);
}

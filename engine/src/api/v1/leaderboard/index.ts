import { type BoardRow, listBoard } from "../../../core/hardware/equity";
import { db } from "../../../db";

/** Opt-in initials and district. No sign-in is required. Full names stay off. */
export async function getLeaderboard(): Promise<{ rows: BoardRow[] }> {
	return { rows: await listBoard(db) };
}

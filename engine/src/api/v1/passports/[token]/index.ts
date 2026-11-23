import { env } from "../../../../config/env";
import {
	type PublicPassport,
	readPublicPassport,
} from "../../../../core/learning/share";
import { getObjectStore } from "../../../../core/storage/object-store";
import { db } from "../../../../db";

/** A stranger's view of one passport. An old or blocked link is not found. */
export async function getPublicPassport(input: {
	token: string;
}): Promise<PublicPassport> {
	return readPublicPassport(db, input.token, {
		signObject: async (objectKey) => {
			try {
				const download = await getObjectStore().createDownloadUrl({
					key: objectKey,
					expiresInSeconds: 300,
				});
				const url = download.url;
				if (url.startsWith("http://") || url.startsWith("https://")) return url;
				return `${env.apiUrl}${url.startsWith("/") ? url : `/${url}`}`;
			} catch {
				return null;
			}
		},
	});
}

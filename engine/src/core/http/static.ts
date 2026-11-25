import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

/**
 * Serves the built web app from one directory (Bun only).
 *
 * A request for a file that exists returns the file. Any other path without a
 * file extension returns `index.html`, so the client router can handle it.
 * A missing file with an extension is a 404: a script tag must never receive
 * the HTML shell.
 */
export function createStaticHandler(directory: string) {
	const root = resolve(directory);
	const indexPath = resolve(root, "index.html");

	async function isFile(path: string): Promise<boolean> {
		try {
			return (await stat(path)).isFile();
		} catch {
			return false;
		}
	}

	function send(path: string, cacheControl: string, head: boolean): Response {
		const file = Bun.file(path);
		return new Response(head ? null : file, {
			headers: {
				"content-type": file.type,
				"cache-control": cacheControl,
				"x-content-type-options": "nosniff",
			},
		});
	}

	return async function serveStatic(request: Request): Promise<Response> {
		const head = request.method === "HEAD";
		let pathname: string;
		try {
			pathname = decodeURIComponent(new URL(request.url).pathname);
		} catch {
			return new Response("Bad request", { status: 400 });
		}

		const path = resolve(root, `.${pathname}`);
		const inside = path === root || path.startsWith(root + sep);
		if (inside && path !== root && (await isFile(path))) {
			// Vite puts a content hash in every name under /assets/.
			const cacheControl = pathname.startsWith("/assets/")
				? "public, max-age=31536000, immutable"
				: "no-cache";
			return send(path, cacheControl, head);
		}

		if (extname(pathname) !== "") {
			return new Response("Not found", { status: 404 });
		}
		return send(indexPath, "no-cache", head);
	};
}

/** Paths the engine answers itself. Everything else belongs to the web app. */
export function isEnginePath(pathname: string): boolean {
	return (
		pathname === "/openapi.json" ||
		pathname === "/api" ||
		pathname.startsWith("/api/")
	);
}

/**
 * Base URL of the engine, without a trailing slash.
 *
 * When `VITE_API_BASE_URL` is unset we assume the engine runs on port 3000 of
 * the same host the page was opened on. Using the page's host (rather than a
 * hard-coded `localhost`) keeps `localhost:5173` and `127.0.0.1:5173` each
 * talking to a same-site engine, which is what the session cookie needs.
 *
 * `VITE_API_BASE_URL="/"` means the engine serves this app itself, so the API
 * is on the page's own origin (the one-container deployment).
 */
function defaultBaseUrl(): string {
	if (typeof window !== "undefined" && window.location.hostname) {
		return `${window.location.protocol}//${window.location.hostname}:3000`;
	}
	return "http://localhost:3000";
}

function resolveBaseUrl(): string {
	const configured = import.meta.env.VITE_API_BASE_URL?.trim();
	if (configured === "/" && typeof window !== "undefined") {
		return window.location.origin;
	}
	return configured || defaultBaseUrl();
}

export const API_BASE_URL = resolveBaseUrl().replace(/\/+$/, "");

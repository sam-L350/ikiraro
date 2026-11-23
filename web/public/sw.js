const SHELL = "ikiraro-shell-v1";
let dataSaver = true;

self.addEventListener("install", (event) => {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
	const data = event.data;
	if (!data || typeof data !== "object") return;
	if (data.type === "data-saver") {
		dataSaver = Boolean(data.on);
		return;
	}
	if (data.type === "clear") {
		event.waitUntil(caches.delete(SHELL));
	}
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (
		dataSaver &&
		(request.destination === "image" ||
			request.destination === "audio" ||
			request.destination === "video")
	) {
		return;
	}
	if (request.mode !== "navigate") return;
	event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
	const cache = await caches.open(SHELL);
	try {
		const response = await fetch(request);
		if (response.ok) {
			try {
				await cache.put("/", response.clone());
			} catch {
				// A response the browser will not store still reaches the screen.
			}
		}
		return response;
	} catch {
		const cached = (await cache.match(request)) ?? (await cache.match("/"));
		if (cached) return cached;
		return Response.error();
	}
}

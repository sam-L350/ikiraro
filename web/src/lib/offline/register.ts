type OfflineMessage = { type: "data-saver"; on: boolean } | { type: "clear" };

function post(
	worker: ServiceWorker | null | undefined,
	message: OfflineMessage,
) {
	worker?.postMessage(message);
}

/** Tell the installed shell about data saver, or to drop its cache. */
export function postOffline(message: OfflineMessage): void {
	if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
		return;
	post(navigator.serviceWorker.controller, message);
	void navigator.serviceWorker
		.getRegistration()
		.then((registration) => {
			post(registration?.active, message);
			post(registration?.waiting, message);
		})
		.catch(() => {
			// The shell is not installed in this browser.
		});
}

export function registerOfflineShell(dataSaver: boolean): void {
	if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
		return;
	void navigator.serviceWorker.register("/sw.js").then(() => {
		postOffline({ type: "data-saver", on: dataSaver });
	});
}

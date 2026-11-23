import { useEffect, useSyncExternalStore } from "react";
import { deliverQueued } from "./deliver";
import {
	flushQueue,
	hydrateOutbox,
	queueCount,
	subscribeQueue,
} from "./outbox";

/** Retry queued attempts, including ones sealed on this device before the reload. */
export function useUploadQueue(): number {
	const count = useSyncExternalStore(subscribeQueue, queueCount, queueCount);

	useEffect(() => {
		let cancel = false;
		const run = () => {
			if (!navigator.onLine || cancel) return;
			void flushQueue(deliverQueued);
		};
		void hydrateOutbox().finally(run);
		const timer = window.setInterval(run, 8_000);
		window.addEventListener("online", run);
		return () => {
			cancel = true;
			window.clearInterval(timer);
			window.removeEventListener("online", run);
		};
	}, []);

	return count;
}

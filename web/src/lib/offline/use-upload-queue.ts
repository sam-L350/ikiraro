import { useEffect, useSyncExternalStore } from "react";
import { deliverSubmission } from "./deliver";
import { flushQueue, queueCount, subscribeQueue } from "./outbox";

/** Retry queued attempts while this tab is open. A reload drops them until phase 6.3. */
export function useUploadQueue(): number {
	const count = useSyncExternalStore(subscribeQueue, queueCount, queueCount);

	useEffect(() => {
		const run = () => {
			if (!navigator.onLine) return;
			void flushQueue(deliverSubmission);
		};
		run();
		const timer = window.setInterval(run, 8_000);
		window.addEventListener("online", run);
		return () => {
			window.clearInterval(timer);
			window.removeEventListener("online", run);
		};
	}, []);

	return count;
}

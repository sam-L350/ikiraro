import { useEffect, useState } from "react";

/** True while the browser can reach the network. Reviews and points stay disabled when it is false. */
export function useOnline(): boolean {
	const [online, setOnline] = useState(() =>
		typeof navigator === "undefined" ? true : navigator.onLine,
	);
	useEffect(() => {
		const markOnline = () => setOnline(true);
		const markOffline = () => setOnline(false);
		window.addEventListener("online", markOnline);
		window.addEventListener("offline", markOffline);
		return () => {
			window.removeEventListener("online", markOnline);
			window.removeEventListener("offline", markOffline);
		};
	}, []);
	return online;
}

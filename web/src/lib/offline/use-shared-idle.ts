import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/lib/auth";
import { endSharedSession } from "./outbox";

/** Signs a shared computer out after the configured quiet time, and drops the outbox. */
export function useSharedIdleLogout(): void {
	const { user, logout, refresh } = useAuth();
	const navigate = useNavigate();
	const shared = user?.sharedDevice === true;
	const timeout = user?.idleTimeoutMs ?? 0;

	useEffect(() => {
		if (!shared || timeout < 60_000) return;

		const expire = () => {
			void endSharedSession({
				logout: async () => {
					await logout();
					navigate("/");
				},
			});
		};
		let idle = window.setTimeout(expire, timeout);
		let lastBeat = 0;
		const bump = () => {
			window.clearTimeout(idle);
			idle = window.setTimeout(expire, timeout);
			const now = Date.now();
			if (now - lastBeat > 60_000) {
				lastBeat = now;
				void refresh();
			}
		};
		window.addEventListener("pointerdown", bump);
		window.addEventListener("keydown", bump);
		return () => {
			window.clearTimeout(idle);
			window.removeEventListener("pointerdown", bump);
			window.removeEventListener("keydown", bump);
		};
	}, [shared, timeout, logout, refresh, navigate]);
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/engine";
import {
	clearPreviewRole,
	PREVIEW_ROLES,
	type PreviewRole,
	readPreviewRole,
} from "./preview-roles";

/** Three clicks on the attached element open the preview. A button remains for the keyboard. */
export function useTripleClick<T extends HTMLElement>(onReveal: () => void) {
	const onRevealRef = useRef(onReveal);
	onRevealRef.current = onReveal;
	const cleanup = useRef<(() => void) | null>(null);

	return useCallback((node: T | null) => {
		cleanup.current?.();
		cleanup.current = null;
		if (!node || !import.meta.env.DEV) return;
		let clicks = 0;
		let timer = 0;
		const onClick = () => {
			clicks += 1;
			window.clearTimeout(timer);
			timer = window.setTimeout(() => {
				clicks = 0;
			}, 500);
			if (clicks >= 3) {
				clicks = 0;
				onRevealRef.current();
			}
		};
		node.addEventListener("click", onClick);
		cleanup.current = () => {
			node.removeEventListener("click", onClick);
			window.clearTimeout(timer);
		};
	}, []);
}

export function OpenPreviewButton({ onOpen }: { onOpen: () => void }) {
	if (!import.meta.env.DEV) return null;
	return (
		<button
			type="button"
			className="sr-only focus:not-sr-only focus:font-meta focus:text-xs focus:font-semibold focus:uppercase focus:text-fg"
			onClick={onOpen}
		>
			Preview as
		</button>
	);
}

export function RolePreviewPanel({
	selected,
	onSelect,
	onClose,
}: {
	selected: string | null;
	onSelect: (role: PreviewRole) => void;
	onClose: () => void;
}) {
	if (!import.meta.env.DEV) return null;
	return (
		<fieldset className="mt-6 border-0 p-0">
			<legend className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
				Preview as
			</legend>
			<div className="mt-2 flex flex-col items-start">
				{PREVIEW_ROLES.map(([code, name]) => (
					<Button
						key={code}
						type="button"
						variant="quiet"
						aria-pressed={selected === code}
						onClick={() => onSelect(code)}
					>
						{name}
					</Button>
				))}
				<Button type="button" variant="quiet" onClick={onClose}>
					Close
				</Button>
			</div>
		</fieldset>
	);
}

/** Applies a role chosen on the sign-in page once the Google session exists. */
export function DevRoleBridge() {
	const { user, refresh } = useAuth();
	const started = useRef(false);

	useEffect(() => {
		if (!import.meta.env.DEV || !user || started.current) return;
		const role = readPreviewRole();
		if (!role) return;
		started.current = true;
		clearPreviewRole();
		void api.updateDevRole({ role }).then(() => refresh());
	}, [user, refresh]);

	return null;
}

export function useRolePreview<T extends HTMLElement>() {
	const [open, setOpen] = useState(false);
	const targetRef = useTripleClick<T>(() => setOpen(true));
	return { open, setOpen, targetRef };
}

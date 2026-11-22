import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import {
	OpenPreviewButton,
	RolePreviewPanel,
	useRolePreview,
} from "@/components/dev/role-preview";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { Wordmark } from "@/components/shell/wordmark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export function PublicShell({ children }: { children: ReactNode }) {
	const { t } = useI18n();
	const { user } = useAuth();

	return (
		<div className="flex min-h-screen flex-col bg-canvas">
			<header className="sticky top-0 z-40 bg-canvas/90 backdrop-blur-sm">
				<div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-6 lg:px-12">
					<Wordmark />
					<div className="flex items-center gap-4">
						<LanguageSwitch />
						{user ? (
							<Button asChild variant="sticker">
								<Link to="/home">{t("continue")}</Link>
							</Button>
						) : (
							<Button asChild variant="sticker">
								<Link to="/login">{t("signIn")}</Link>
							</Button>
						)}
					</div>
				</div>
			</header>
			<main className="flex-1">{children}</main>
			<footer className="mt-8 bg-canvas px-6 pb-6 lg:px-12">
				<div className="rounded-t-[48px] bg-ink px-8 pb-10 pt-16 text-ink-fg sm:px-12">
					<div className="mx-auto flex max-w-5xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
						<Wordmark inverted />
						<p className="font-sans text-sm font-medium text-ink-muted">
							Kigali
						</p>
					</div>
				</div>
			</footer>
		</div>
	);
}

export function ProductShell({
	children,
}: {
	children: ReactNode;
	surface: "learner" | "staff";
}) {
	const { t } = useI18n();
	const { user, isLoading, logout, refresh } = useAuth();
	const { open, setOpen, targetRef } = useRolePreview<HTMLParagraphElement>();
	const [switching, setSwitching] = useState(false);
	const name = user?.name ?? user?.email ?? "…";
	const roleName = user?.roles[0]?.name;

	return (
		<div className="flex min-h-screen flex-col bg-canvas">
			<header className="sticky top-0 z-40 border-b border-line bg-canvas">
				<div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3 lg:px-12">
					<div className="flex min-w-0 flex-col gap-1">
						<Wordmark />
						<OpenPreviewButton onOpen={() => setOpen(true)} />
						<p
							ref={targetRef}
							className="font-sans text-sm font-semibold text-fg"
						>
							{isLoading ? "…" : t("signedInAs", { name })}
						</p>
						{roleName ? (
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{roleName}
							</p>
						) : null}
						<p className="font-sans text-sm text-fg-muted">
							{t("centerPending")}
						</p>
					</div>
					<div className="flex items-center gap-3">
						<LanguageSwitch />
						<Button type="button" variant="quiet" onClick={() => void logout()}>
							{t("signOut")}
						</Button>
					</div>
				</div>
			</header>
			<main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 lg:px-12">
				{open ? (
					<RolePreviewPanel
						selected={user?.roles[0]?.code ?? null}
						onSelect={(role) => {
							setSwitching(true);
							void api
								.updateDevRole({ role })
								.then(() => refresh())
								.finally(() => {
									setSwitching(false);
									setOpen(false);
								});
						}}
						onClose={() => setOpen(false)}
					/>
				) : null}
				{switching ? (
					<p className="mb-6 font-sans text-sm font-medium text-fg">
						Switching role…
					</p>
				) : null}
				{children}
			</main>
		</div>
	);
}

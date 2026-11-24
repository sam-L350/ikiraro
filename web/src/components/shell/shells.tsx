import { Menu, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import {
	RolePreviewPanel,
	useRolePreview,
} from "@/components/dev/role-preview";
import { LanguageSwitch } from "@/components/shell/language-switch";
import {
	ProductIdentity,
	ProductNav,
	ProductNavLinks,
} from "@/components/shell/product-nav";
import { Wordmark } from "@/components/shell/wordmark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { api, invalidateEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import { UploadQueueNotice } from "@/lib/offline/upload-notice";
import { useSharedIdleLogout } from "@/lib/offline/use-shared-idle";

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
	const { user, logout, refresh } = useAuth();
	useSharedIdleLogout();
	const { open, setOpen, targetRef } = useRolePreview<HTMLParagraphElement>();
	const [switching, setSwitching] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

	useEffect(() => {
		if (!menuOpen) return;
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") setMenuOpen(false);
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [menuOpen]);

	return (
		<div className="flex h-screen overflow-hidden bg-canvas">
			<ProductNav nameRef={targetRef} onPreview={() => setOpen(true)} />
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<header className="z-40 shrink-0 border-b border-line bg-canvas">
					<div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-6 lg:justify-end lg:px-12">
						<div className="flex items-center gap-2 lg:hidden">
							<button
								type="button"
								className="inline-flex size-11 items-center justify-center rounded-full text-ink"
								aria-expanded={menuOpen}
								aria-controls="product-drawer"
								onClick={() => setMenuOpen(true)}
							>
								<Menu aria-hidden="true" className="size-5" />
								<span className="sr-only">{t("openMenu")}</span>
							</button>
							<Wordmark />
						</div>
						<div className="flex items-center gap-3">
							<LanguageSwitch />
							<Button
								type="button"
								variant="quiet"
								onClick={() => void logout()}
							>
								{t("signOut")}
							</Button>
						</div>
					</div>
				</header>
				{menuOpen ? (
					<div className="fixed inset-0 z-50 lg:hidden">
						<button
							type="button"
							className="absolute inset-0 bg-ink/40"
							aria-label={t("closeMenu")}
							onClick={() => setMenuOpen(false)}
						/>
						<div
							id="product-drawer"
							role="dialog"
							aria-modal="true"
							aria-label={t("navLabel")}
							className="absolute inset-y-0 left-0 flex w-[min(100%,20rem)] flex-col bg-canvas"
						>
							<div className="flex shrink-0 items-center justify-between px-5 pt-6">
								<Wordmark />
								<button
									type="button"
									className="inline-flex size-11 items-center justify-center rounded-full text-ink"
									onClick={() => setMenuOpen(false)}
								>
									<X aria-hidden="true" className="size-5" />
									<span className="sr-only">{t("closeMenu")}</span>
								</button>
							</div>
							<div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
								<ProductIdentity onPreview={() => setOpen(true)} />
								<div className="mt-6">
									<ProductNavLinks onNavigate={() => setMenuOpen(false)} />
								</div>
							</div>
						</div>
					</div>
				) : null}
				<main className="min-h-0 flex-1 overflow-y-auto">
					<div className="mx-auto w-full max-w-6xl px-6 py-12 lg:px-12">
						{open ? (
							<RolePreviewPanel
								selected={user?.roles[0]?.code ?? null}
								onSelect={(role) => {
									setSwitching(true);
									void api
										.updateDevRole({ role })
										.then(() => refresh())
										.then(() => invalidateEngine("/staff/context"))
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
						<UploadQueueNotice />
						{children}
					</div>
				</main>
			</div>
		</div>
	);
}

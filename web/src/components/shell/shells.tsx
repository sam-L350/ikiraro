import type { ReactNode } from "react";
import { Link } from "react-router";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { Wordmark } from "@/components/shell/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
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
	surface,
}: {
	children: ReactNode;
	surface: "learner" | "staff";
}) {
	const { t } = useI18n();
	const { user, isLoading, logout } = useAuth();
	const name = user?.name ?? user?.email ?? "…";

	return (
		<div className="flex min-h-screen flex-col bg-canvas">
			<header className="sticky top-0 z-40 border-b border-line bg-canvas">
				<div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3 lg:px-12">
					<div className="flex min-w-0 flex-col gap-1">
						<Wordmark />
						<p className="font-sans text-sm font-semibold text-fg">
							{isLoading ? "…" : t("signedInAs", { name })}
						</p>
						<p className="font-sans text-sm text-fg-muted">
							{t("centerPending")}
						</p>
					</div>
					<div className="flex items-center gap-3">
						<LanguageSwitch />
						{surface === "staff" ? (
							<details className="relative">
								<summary className="flex h-11 cursor-pointer list-none items-center font-meta text-xs font-semibold uppercase tracking-wide text-fg">
									{t("account")}
								</summary>
								<div className="absolute right-0 z-10 mt-2 flex items-center gap-3 rounded-[20px] bg-surface p-3">
									<span className="font-meta text-xs uppercase tracking-wide text-fg-muted">
										{t("theme")}
									</span>
									<ThemeToggle />
								</div>
							</details>
						) : null}
						<Button type="button" variant="quiet" onClick={() => void logout()}>
							{t("signOut")}
						</Button>
					</div>
				</div>
			</header>
			<main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 lg:px-12">
				{children}
			</main>
		</div>
	);
}

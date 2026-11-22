import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { isApiClientError, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useSharedIdleLogout } from "@/lib/offline/use-shared-idle";

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "short_password":
			return "shortPassword";
		case "same_password":
			return "samePassword";
		case "wrong_password":
			return "wrongPassword";
		default:
			return "tryAgain";
	}
}

export default function PasswordPage() {
	const { t } = useI18n();
	const { user, logout, refresh } = useAuth();
	const navigate = useNavigate();
	useSharedIdleLogout();
	const change = useEngineMutation("/auth/password");
	const [currentPassword, setCurrentPassword] = useState("");
	const [nextPassword, setNextPassword] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);
	const shared = user?.sharedDevice === true;
	const name = user?.name ?? user?.email ?? "";

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await change.mutateAsync({ body: { currentPassword, nextPassword } });
			await refresh();
			navigate("/home");
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 py-16">
			<p className="font-sans text-sm font-semibold text-fg" role="status">
				{t("signedInAs", { name })}
			</p>
			<h1 className="mt-4 font-sans text-3xl font-semibold text-balance text-fg">
				{t("passwordChangeTitle")}
			</h1>
			<form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
				<p className="font-sans text-lg font-medium text-fg">
					{t("passwordChangeSentence")}
				</p>
				<label className="flex flex-col gap-2" htmlFor="current-password">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("currentPassword")}
					</span>
					<Input
						id="current-password"
						type="password"
						autoComplete={shared ? "off" : "current-password"}
						value={currentPassword}
						onChange={(event) => setCurrentPassword(event.target.value)}
						required
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="next-password">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("newPassword")}
					</span>
					<Input
						id="next-password"
						type="password"
						autoComplete={shared ? "off" : "new-password"}
						value={nextPassword}
						onChange={(event) => setNextPassword(event.target.value)}
						required
					/>
				</label>
				{error ? (
					<p className="font-sans text-sm font-medium text-danger" role="alert">
						{t(error)}
					</p>
				) : null}
				<div>
					<Button type="submit" variant="sticker" disabled={change.isPending}>
						{t("savePassword")}
					</Button>
				</div>
			</form>
			<Button
				type="button"
				variant="quiet"
				className="mt-6 px-0"
				onClick={() => {
					void logout().then(() => navigate("/"));
				}}
			>
				{t("signOut")}
			</Button>
		</main>
	);
}

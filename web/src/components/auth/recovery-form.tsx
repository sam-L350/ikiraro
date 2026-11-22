import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { isApiClientError, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

const largeField =
	"h-14 rounded-2xl px-4 font-sans text-2xl tracking-[0.2em] tabular-nums";

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	if (error.status === 429) return "tooManyAttempts";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "invalid_phone":
			return "invalidPhone";
		case "wrong_code":
			return "wrongCode";
		case "not_active":
			return "notActive";
		case "deactivated":
			return "deactivated";
		default:
			return "tryAgain";
	}
}

export function RecoveryForm({ redirectTo }: { redirectTo: string }) {
	const { t } = useI18n();
	const { refresh } = useAuth();
	const navigate = useNavigate();
	const [phone, setPhone] = useState("");
	const [code, setCode] = useState("");
	const [sent, setSent] = useState(false);
	const [error, setError] = useState<MessageKey | null>(null);
	const send = useEngineMutation("/auth/recovery");
	const open = useEngineMutation("/auth/recovery/session");

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			if (!sent) {
				await send.mutateAsync({ body: { phone } });
				setSent(true);
				return;
			}
			await open.mutateAsync({ body: { phone, code } });
			await refresh();
			navigate(redirectTo);
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<form className="mt-4 flex w-full flex-col items-start" onSubmit={onSubmit}>
			<p className="font-sans text-lg font-medium text-fg">
				{sent ? t("enterCode") : t("recoverSentence")}
			</p>
			<label
				className="mt-8 flex w-full flex-col gap-2"
				htmlFor="recover-phone"
			>
				<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{sent ? t("codeLabel") : t("phoneLabel")}
				</span>
				<Input
					id="recover-phone"
					className={largeField}
					inputMode={sent ? "numeric" : "tel"}
					autoComplete={sent ? "one-time-code" : "tel"}
					value={sent ? code : phone}
					aria-invalid={error ? true : undefined}
					onChange={(event) =>
						sent ? setCode(event.target.value) : setPhone(event.target.value)
					}
					required
				/>
			</label>
			{error ? (
				<p
					className="mt-2 font-sans text-sm font-medium text-danger"
					role="alert"
				>
					{t(error)}
				</p>
			) : null}
			{sent && import.meta.env.DEV ? (
				<p className="mt-2 font-sans text-sm text-fg-muted">
					{t("devCodeHint")}
				</p>
			) : null}
			<div className="mt-8">
				<Button
					type="submit"
					variant="sticker"
					disabled={send.isPending || open.isPending}
				>
					{sent ? t("signIn") : t("sendCode")}
				</Button>
			</div>
		</form>
	);
}

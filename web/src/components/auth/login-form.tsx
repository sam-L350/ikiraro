import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { api, isApiClientError } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type Step = "phone" | "code" | "password";

const largeField =
	"h-14 rounded-2xl px-4 font-sans text-2xl tracking-[0.2em] tabular-nums";

function messageKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	if (error.status === 429) return "tooManyAttempts";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "invalid_phone":
			return "invalidPhone";
		case "wrong_code":
			return "wrongCode";
		case "wrong_password":
			return "wrongPassword";
		default:
			return "tryAgain";
	}
}

export function LoginForm({ redirectTo }: { redirectTo: string }) {
	const { t } = useI18n();
	const { refresh } = useAuth();
	const navigate = useNavigate();
	const [step, setStep] = useState<Step>("phone");
	const [phone, setPhone] = useState("");
	const [code, setCode] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);
	const [pending, setPending] = useState(false);

	const sentence =
		step === "code"
			? "enterCode"
			: step === "password"
				? "staffLogin"
				: "loginSentence";

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setPending(true);
		try {
			if (step === "phone") {
				await api.createAuthOtp({ phone });
				setStep("code");
				return;
			}
			if (step === "code") {
				await api.createAuthSession({ method: "otp", phone, code });
			} else {
				await api.createAuthSession({ method: "password", email, password });
			}
			await refresh();
			navigate(redirectTo);
		} catch (caught) {
			setError(messageKey(caught));
		} finally {
			setPending(false);
		}
	}

	return (
		<form className="mt-4 flex w-full flex-col items-start" onSubmit={onSubmit}>
			<p className="font-sans text-lg font-medium text-fg">{t(sentence)}</p>
			{step === "password" ? (
				<div className="mt-8 flex w-full flex-col gap-4">
					<label className="flex w-full flex-col gap-2" htmlFor="login-email">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("emailLabel")}
						</span>
						<Input
							id="login-email"
							type="email"
							autoComplete="username"
							value={email}
							aria-invalid={error ? true : undefined}
							onChange={(event) => setEmail(event.target.value)}
							required
						/>
					</label>
					<label
						className="flex w-full flex-col gap-2"
						htmlFor="login-password"
					>
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("passwordLabel")}
						</span>
						<Input
							id="login-password"
							type="password"
							autoComplete="current-password"
							value={password}
							aria-invalid={error ? true : undefined}
							onChange={(event) => setPassword(event.target.value)}
							required
						/>
					</label>
				</div>
			) : (
				<label
					className="mt-8 flex w-full flex-col gap-2"
					htmlFor="login-phone"
				>
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{step === "code" ? t("codeLabel") : t("phoneLabel")}
					</span>
					<Input
						id="login-phone"
						className={largeField}
						inputMode={step === "code" ? "numeric" : "tel"}
						autoComplete={step === "code" ? "one-time-code" : "tel"}
						value={step === "code" ? code : phone}
						aria-invalid={error ? true : undefined}
						onChange={(event) =>
							step === "code"
								? setCode(event.target.value)
								: setPhone(event.target.value)
						}
						required
					/>
				</label>
			)}
			{error ? (
				<p
					className="mt-2 font-sans text-sm font-medium text-danger"
					role="alert"
				>
					{t(error)}
				</p>
			) : null}
			{step === "code" && import.meta.env.DEV ? (
				<p className="mt-2 font-sans text-sm text-fg-muted">
					{t("devCodeHint")}
				</p>
			) : null}
			<div className="mt-8">
				<Button type="submit" variant="sticker" disabled={pending}>
					{step === "phone" ? t("sendCode") : t("signIn")}
				</Button>
			</div>
			{step === "phone" ? (
				<Button
					type="button"
					variant="quiet"
					className="mt-2"
					onClick={() => {
						setError(null);
						setStep("password");
					}}
				>
					{t("useEmail")}
				</Button>
			) : (
				<Button
					type="button"
					variant="quiet"
					className="mt-2"
					onClick={() => {
						setError(null);
						setStep("phone");
						setCode("");
					}}
				>
					{t("usePhone")}
				</Button>
			)}
		</form>
	);
}

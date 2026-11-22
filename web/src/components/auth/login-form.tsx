import { ArrowLeft, ChevronRight, KeyRound, Smartphone } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLoginUrl, useAuth } from "@/lib/auth";
import { api, isApiClientError } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type Step = "choose" | "phone" | "code" | "password";

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
		case "not_active":
			return "notActive";
		case "deactivated":
			return "deactivated";
		default:
			return "tryAgain";
	}
}

function sentenceKey(step: Step): MessageKey {
	switch (step) {
		case "choose":
			return "chooseMethod";
		case "phone":
			return "loginSentence";
		case "code":
			return "enterCode";
		case "password":
			return "staffLogin";
		default: {
			const unreachable: never = step;
			return unreachable;
		}
	}
}

function MethodChoice({
	title,
	body,
	icon,
	tone,
	href,
	onClick,
}: {
	title: string;
	body: string;
	icon: ReactNode;
	tone: "yellow" | "sky" | "surface";
	href?: string;
	onClick?: () => void;
}) {
	const className = cn(
		"flex w-full items-center gap-4 rounded-[20px] border border-ink/15 bg-surface p-4 text-left transition-colors",
		"hover:border-ink focus-visible:border-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/40",
	);
	const content = (
		<>
			<span
				className={cn(
					"flex size-14 shrink-0 items-center justify-center rounded-full",
					tone === "yellow" && "bg-yellow text-ink-fixed",
					tone === "sky" && "bg-sky text-ink-fixed",
					tone === "surface" && "bg-canvas text-ink-fixed",
				)}
			>
				{icon}
			</span>
			<span className="min-w-0 flex-1">
				<span className="block font-sans text-lg font-semibold text-fg">
					{title}
				</span>
				<span className="mt-1 block font-sans text-sm font-medium text-fg-muted">
					{body}
				</span>
			</span>
			<ChevronRight className="size-5 shrink-0 text-fg" aria-hidden />
		</>
	);
	if (href) {
		return (
			<a className={className} href={href}>
				{content}
			</a>
		);
	}
	return (
		<button type="button" className={className} onClick={onClick}>
			{content}
		</button>
	);
}

function GoogleMark() {
	return (
		<svg viewBox="0 0 24 24" className="size-7" aria-hidden>
			<path
				fill="#4285F4"
				d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"
			/>
			<path
				fill="#34A853"
				d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
			/>
			<path
				fill="#FBBC05"
				d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11l4-3.1z"
			/>
			<path
				fill="#EA4335"
				d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
			/>
		</svg>
	);
}

export function LoginForm({ redirectTo }: { redirectTo: string }) {
	const { t } = useI18n();
	const { refresh } = useAuth();
	const navigate = useNavigate();
	const [step, setStep] = useState<Step>("choose");
	const [phone, setPhone] = useState("");
	const [code, setCode] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);
	const [pending, setPending] = useState(false);

	function choose(next: Step) {
		setError(null);
		setStep(next);
	}

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
			} else if (step === "password") {
				await api.createAuthSession({ method: "password", email, password });
			} else {
				return;
			}
			await refresh();
			navigate(redirectTo);
		} catch (caught) {
			setError(messageKey(caught));
		} finally {
			setPending(false);
		}
	}

	if (step === "choose") {
		return (
			<div className="mt-4 w-full">
				<p className="font-sans text-lg font-medium text-fg">
					{t("chooseMethod")}
				</p>
				<div className="mt-6 flex flex-col gap-3">
					<MethodChoice
						title={t("phoneChoiceTitle")}
						body={t("phoneChoiceBody")}
						tone="yellow"
						icon={<Smartphone className="size-7" />}
						onClick={() => choose("phone")}
					/>
					<MethodChoice
						title={t("emailChoiceTitle")}
						body={t("emailChoiceBody")}
						tone="sky"
						icon={<KeyRound className="size-7" />}
						onClick={() => choose("password")}
					/>
					<MethodChoice
						title={t("googleChoiceTitle")}
						body={t("googleChoiceBody")}
						tone="surface"
						icon={<GoogleMark />}
						href={getLoginUrl(redirectTo)}
					/>
				</div>
			</div>
		);
	}

	return (
		<form className="mt-4 flex w-full flex-col items-start" onSubmit={onSubmit}>
			<Button
				type="button"
				variant="quiet"
				className="px-0"
				onClick={() => choose("choose")}
			>
				<ArrowLeft className="size-4" />
				{t("allMethods")}
			</Button>
			<p className="mt-4 font-sans text-lg font-medium text-fg">
				{t(sentenceKey(step))}
			</p>
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
		</form>
	);
}

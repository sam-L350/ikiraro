import { type FormEvent, useState } from "react";
import { BadgeMark } from "@/components/public/marks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type CredentialCheck = {
	subject: "badge" | "passport" | "unknown";
	authentic: boolean;
	revoked: boolean;
};

export default function VerifyCredentialPage() {
	const { t } = useI18n();
	const [draft, setDraft] = useState("");
	const [token, setToken] = useState("");
	const ready = draft.trim() !== "";
	const result = useEngine(
		"/credentials/check",
		{ query: { token } },
		{ enabled: token.length > 0 },
	);

	function submit(event: FormEvent) {
		event.preventDefault();
		if (!ready) return;
		setToken(draft.trim());
	}

	const data = result.data as CredentialCheck | undefined;
	const limited = isApiClientError(result.error) && result.error.status === 429;

	return (
		<section className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
			<div className="grid items-center gap-8 sm:grid-cols-[9rem_1fr]">
				<BadgeMark className="size-28" />
				<div className="flex flex-col gap-4">
					<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
						{t("credentialsTitle")}
					</h1>
					<p className="font-sans text-lg font-semibold leading-relaxed text-fg">
						{t("credentialsSentence")}
					</p>
				</div>
			</div>
			<form className="flex flex-col gap-4" onSubmit={submit}>
				<label className="flex flex-col gap-2" htmlFor="credential-token">
					<span className="font-meta text-xs uppercase text-fg-muted">
						{t("credentialsToken")}
					</span>
					<Input
						id="credential-token"
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						autoComplete="off"
					/>
				</label>
				{ready ? (
					<Button type="submit" variant="ink" className="w-fit">
						{t("credentialsSend")}
					</Button>
				) : null}
			</form>
			{limited ? (
				<p className="text-lg text-fg">{t("credentialsLimited")}</p>
			) : null}
			{data ? (
				<div className="flex flex-col gap-3 rounded-[20px] bg-surface p-6">
					{data.subject === "unknown" ? (
						<p className="text-lg text-fg">{t("credentialsUnknown")}</p>
					) : null}
					<Badge
						variant={data.authentic ? "verified" : "danger"}
						className="w-fit"
					>
						{data.authentic
							? t("credentialsAuthentic")
							: t("credentialsNotAuthentic")}
					</Badge>
					<Badge variant={data.revoked ? "warn" : "neutral"} className="w-fit">
						{data.revoked
							? t("credentialsRevoked")
							: t("credentialsNotRevoked")}
					</Badge>
				</div>
			) : null}
		</section>
	);
}

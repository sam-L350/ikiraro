import { useState } from "react";
import { SessionList } from "@/components/auth/session-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export function AccountSecurity() {
	const { t, locale } = useI18n();
	const { user } = useAuth();
	const isStaff = user?.roles.some((role) => role.code !== "learner") ?? false;
	const lock = useEngine("/auth/lockout");
	const factor = useEngine("/factors", undefined, { enabled: isStaff });
	const start = useEngineMutation("/factors/start");
	const confirm = useEngineMutation("/factors/confirm");
	const [secret, setSecret] = useState<string | null>(null);
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const until = lock.data?.until ?? null;
	const enabled = factor.data?.enabled === true;
	const canConfirm = secret !== null && code.trim().length > 0;
	const lockedText =
		lock.data?.locked && until
			? t("lockoutUntil", {
					time: new Intl.DateTimeFormat(locale === "rw" ? "rw-RW" : "en", {
						dateStyle: "medium",
						timeStyle: "short",
					}).format(new Date(until)),
				})
			: t("lockoutClear");

	return (
		<div className="mt-8 flex flex-col gap-10">
			<p className="font-sans text-lg font-medium text-fg">{lockedText}</p>
			{isStaff ? (
				<section className="flex flex-col gap-4">
					<h2 className="font-sans text-2xl font-semibold text-fg">
						{t("factorTitle")}
					</h2>
					<p className="font-sans text-lg font-medium text-fg">
						{enabled ? t("factorOn") : t("factorSentence")}
					</p>
					{secret ? (
						<p className="font-meta text-sm font-semibold tracking-wide text-fg">
							{t("factorSecret")} {secret}
						</p>
					) : null}
					{enabled || secret ? null : (
						<div>
							<Button
								type="button"
								variant="quiet"
								disabled={start.isPending}
								onClick={() => {
									setError(null);
									void start
										.mutateAsync()
										.then((row) => {
											setSecret(row.secret);
											setCode("");
										})
										.catch((caught: unknown) => {
											setError(
												isApiClientError(caught)
													? caught.message
													: t("tryAgain"),
											);
										});
								}}
							>
								{t("factorStart")}
							</Button>
						</div>
					)}
					{secret && !enabled ? (
						<label
							className="flex max-w-xs flex-col gap-2"
							htmlFor="factor-code"
						>
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("factorCode")}
							</span>
							<Input
								id="factor-code"
								inputMode="numeric"
								autoComplete="one-time-code"
								value={code}
								onChange={(event) => setCode(event.target.value)}
							/>
						</label>
					) : null}
					{error ? (
						<p
							className="font-sans text-sm font-medium text-danger"
							role="alert"
						>
							{error}
						</p>
					) : null}
					{canConfirm ? (
						<div>
							<Button
								type="button"
								variant="ink"
								disabled={confirm.isPending}
								onClick={() => {
									setError(null);
									void confirm
										.mutateAsync({ body: { code: code.trim() } })
										.then(async () => {
											setSecret(null);
											setCode("");
											await factor.invalidate();
										})
										.catch((caught: unknown) => {
											setError(
												isApiClientError(caught)
													? caught.message
													: t("tryAgain"),
											);
										});
								}}
							>
								{t("factorConfirm")}
							</Button>
						</div>
					) : null}
				</section>
			) : null}
			<SessionList />
		</div>
	);
}

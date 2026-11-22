import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { isApiClientError, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	if (error.status === 429) return "tooManyAttempts";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "deletion_pending":
			return "accountClosed";
		default:
			return "tryAgain";
	}
}

export function PrivacyActions() {
	const { t } = useI18n();
	const { logout } = useAuth();
	const navigate = useNavigate();
	const [step, setStep] = useState<"idle" | "deactivate" | "delete">("idle");
	const [error, setError] = useState<MessageKey | null>(null);
	const deactivate = useEngineMutation("/account/deactivation");
	const deletion = useEngineMutation("/privacy/deletion");
	const pending = deactivate.isPending || deletion.isPending;

	async function finish(action: "deactivate" | "delete") {
		setError(null);
		try {
			if (action === "deactivate") await deactivate.mutateAsync();
			else await deletion.mutateAsync();
			await logout();
			navigate("/");
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<section className="mt-16">
			<h2 className="font-sans text-2xl font-semibold text-fg">
				{t("privacyHeading")}
			</h2>
			{step === "idle" ? (
				<div className="mt-4 flex flex-col items-start gap-2">
					<Button
						type="button"
						variant="quiet"
						className="px-0"
						onClick={() => setStep("deactivate")}
					>
						{t("deactivateTitle")}
					</Button>
					<Button
						type="button"
						variant="quiet"
						className="px-0"
						onClick={() => setStep("delete")}
					>
						{t("deleteTitle")}
					</Button>
				</div>
			) : null}
			{step === "deactivate" ? (
				<div className="mt-4 flex flex-col items-start gap-4">
					<p className="font-sans text-lg font-medium text-fg">
						{t("deactivateBody")}
					</p>
					<Button
						type="button"
						variant="danger"
						disabled={pending}
						onClick={() => void finish("deactivate")}
					>
						{t("deactivateAction")}
					</Button>
				</div>
			) : null}
			{step === "delete" ? (
				<div className="mt-4 flex flex-col items-start gap-4">
					<p className="font-sans text-lg font-medium text-fg">
						{t("deleteBody")}
					</p>
					<Button
						type="button"
						variant="danger"
						disabled={pending}
						onClick={() => void finish("delete")}
					>
						{t("deleteAction")}
					</Button>
				</div>
			) : null}
			{error ? (
				<p
					className="mt-3 font-sans text-sm font-medium text-danger"
					role="alert"
				>
					{t(error)}
				</p>
			) : null}
		</section>
	);
}

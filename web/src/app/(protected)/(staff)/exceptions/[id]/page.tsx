import { useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type GrantException = {
	id: string;
	itemName: string;
	reason: string;
	mine: boolean;
	status: string;
	publicSummary: boolean;
};

export default function ExceptionPage() {
	const { t } = useI18n();
	const online = useOnline();
	const { id = "" } = useParams();
	const list = useEngine("/exceptions");
	const approve = useEngineMutation("/exceptions/:id/approve");
	const decline = useEngineMutation("/exceptions/:id/decline");
	const [error, setError] = useState<MessageKey | null>(null);
	const rows = (list.data?.exceptions ?? []) as GrantException[];
	const detail = rows.find((row) => row.id === id);

	async function onDecide(kind: "approve" | "decline") {
		setError(null);
		if (!online || !detail) {
			setError("tryAgain");
			return;
		}
		try {
			if (kind === "approve") {
				await approve.mutateAsync({ body: { id: detail.id } });
			} else {
				await decline.mutateAsync({ body: { id: detail.id } });
			}
			await list.invalidate();
		} catch {
			setError("tryAgain");
		}
	}

	if (!id || list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("exceptionsDenied")}
			</p>
		);
	}
	if (list.error || !detail) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("recoveryMissing")}
			</p>
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<Link
					to="/exceptions"
					className="font-sans text-sm font-semibold text-fg"
				>
					{t("exceptionsTitle")}
				</Link>
				<h1 className="mt-3 font-sans text-4xl font-semibold text-balance text-fg">
					{detail.itemName}
				</h1>
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{detail.reason}
				</p>
			</div>
			{detail.status !== "pending" ? (
				<p className="font-sans text-lg font-medium text-fg">
					{detail.status === "approved"
						? t("exceptionsApprove")
						: t("exceptionsDecline")}
				</p>
			) : detail.mine ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("exceptionsMine")}
				</p>
			) : (
				<div className="flex flex-wrap items-center gap-3">
					<Button
						type="button"
						variant="sticker"
						className="w-fit"
						disabled={approve.isPending}
						onClick={() => void onDecide("approve")}
					>
						{t("exceptionsApprove")}
					</Button>
					<Button
						type="button"
						variant="quiet"
						disabled={decline.isPending}
						onClick={() => void onDecide("decline")}
					>
						{t("exceptionsDecline")}
					</Button>
				</div>
			)}
			{error ? (
				<p className="font-sans text-sm font-medium text-danger" role="alert">
					{t(error)}
				</p>
			) : null}
		</section>
	);
}

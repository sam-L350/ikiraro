import { useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type AwardCondition = {
	id: string;
	itemName: string;
	conditions: string | null;
	agreed: boolean;
};

export default function ConditionPage() {
	const { t } = useI18n();
	const online = useOnline();
	const { id = "" } = useParams();
	const condition = useEngine(
		"/conditions/:id",
		{ query: { id } },
		{ enabled: Boolean(id) },
	);
	const agree = useEngineMutation("/conditions/:id/agree");
	const [error, setError] = useState<MessageKey | null>(null);
	const detail = condition.data as AwardCondition | undefined;

	async function onAgree() {
		setError(null);
		if (!online || !detail?.conditions) {
			setError("tryAgain");
			return;
		}
		try {
			await agree.mutateAsync({ body: { id: detail.id } });
			await condition.invalidate();
		} catch {
			setError("tryAgain");
		}
	}

	if (!id || condition.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (condition.error || !detail) {
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
					to="/conditions"
					className="font-sans text-sm font-semibold text-fg"
				>
					{t("conditionsTitle")}
				</Link>
				<h1 className="mt-3 font-sans text-4xl font-semibold text-balance text-fg">
					{detail.itemName}
				</h1>
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{detail.conditions ?? t("conditionsEmpty")}
				</p>
			</div>
			{detail.agreed ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("recoveryAgreed")}
				</p>
			) : detail.conditions ? (
				<div className="flex flex-col gap-4">
					{error ? (
						<p
							className="font-sans text-sm font-medium text-danger"
							role="alert"
						>
							{t(error)}
						</p>
					) : null}
					<Button
						type="button"
						variant="sticker"
						className="w-fit"
						disabled={agree.isPending}
						onClick={() => void onAgree()}
					>
						{t("recoveryAgree")}
					</Button>
				</div>
			) : null}
		</section>
	);
}

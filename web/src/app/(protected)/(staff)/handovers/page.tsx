import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type HandoverGrant = {
	id: string;
	itemName: string;
	serial: string;
	recipientName: string;
	recorded: boolean;
};

export default function HandoversPage() {
	const { t } = useI18n();
	const list = useEngine("/handovers");

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("handoverDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const grants = (list.data.grants ?? []) as HandoverGrant[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("handoverTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("handoverSentence")}
				</p>
			</div>
			{grants.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("handoverEmpty")}
				</p>
			) : (
				<ul>
					{grants.map((grant) => (
						<li key={grant.id} className="border-t border-ink/15 py-4">
							<Link
								to={`/handovers/${grant.id}`}
								className="flex flex-col gap-2"
							>
								<p className="font-sans text-lg font-medium text-fg">
									{grant.itemName}
								</p>
								<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
									{grant.serial} · {grant.recipientName}
								</p>
								{grant.recorded ? (
									<Badge variant="neutral">{t("handoverRecorded")}</Badge>
								) : null}
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

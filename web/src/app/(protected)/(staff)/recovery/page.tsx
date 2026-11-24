import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type RecoveryGrant = {
	id: string;
	itemName: string;
	recipientName: string;
	hasConditions: boolean;
	agreed: boolean;
	recovered: boolean;
};

export default function RecoveryPage() {
	const { t } = useI18n();
	const list = useEngine("/recovery");

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("recoveryDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const grants = (list.data.grants ?? []) as RecoveryGrant[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("recoveryTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("recoverySentence")}
				</p>
			</div>
			{grants.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("recoveryEmpty")}
				</p>
			) : (
				<ul>
					{grants.map((grant) => (
						<li key={grant.id} className="border-t border-ink/15 py-4">
							<Link
								to={`/recovery/${grant.id}`}
								className="flex flex-col gap-2"
							>
								<p className="font-sans text-lg font-medium text-fg">
									{grant.itemName}
								</p>
								<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
									{grant.recipientName}
								</p>
								{grant.recovered ? (
									<Badge variant="neutral">{t("recoveryDone")}</Badge>
								) : null}
								{grant.agreed ? (
									<Badge variant="neutral">{t("recoveryAgreed")}</Badge>
								) : null}
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

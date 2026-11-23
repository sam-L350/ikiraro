import { Link } from "react-router";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type Kind = "misconduct" | "bribery" | "favoritism";

type Concern = {
	id: string;
	kind: Kind;
	centerName: string;
	reporterName: string | null;
	createdAt: string;
};

function kindKey(kind: Kind): MessageKey {
	switch (kind) {
		case "misconduct":
			return "reportMisconduct";
		case "bribery":
			return "reportBribery";
		case "favoritism":
			return "reportFavoritism";
		default: {
			const unreachable: never = kind;
			return unreachable;
		}
	}
}

export default function ConcernsPage() {
	const { t } = useI18n();
	const queue = useEngine("/misconduct/queue");

	if (queue.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(queue.error) && queue.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (queue.error || !queue.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const rows = queue.data as Concern[];

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8">
			<div className="flex flex-col gap-3">
				<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
					{t("concernsTitle")}
				</h1>
				<p className="text-lg text-fg">{t("concernsLead")}</p>
			</div>
			{rows.length === 0 ? (
				<p className="text-lg text-fg">{t("concernsEmpty")}</p>
			) : (
				<ul className="flex flex-col">
					{rows.map((row) => (
						<li key={row.id} className="border-t border-ink/15 py-4">
							<Link
								to={`/concerns/${row.id}`}
								className="flex flex-col gap-1 font-sans text-lg font-semibold text-fg"
							>
								<span>{t(kindKey(row.kind))}</span>
								<span className="text-sm font-medium">
									{row.centerName}
									{row.reporterName ? ` · ${row.reporterName}` : ""}
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

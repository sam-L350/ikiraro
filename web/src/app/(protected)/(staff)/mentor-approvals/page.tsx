import { Link } from "react-router";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Row = {
	id: string;
	name: string;
	kind: "mentor" | "partner";
	weeklyContactCap: number;
};

export default function MentorApprovalsPage() {
	const { t } = useI18n();
	const list = useEngine("/mentor-approvals");

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("mentorsApprovalDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = (list.data.items ?? []) as Row[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("mentorsApprovals")}
			</h1>
			{items.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("mentorsApprovalsEmpty")}
				</p>
			) : (
				<ul>
					{items.map((row) => (
						<li key={row.id} className="border-t border-ink/15 py-4">
							<Link
								to={`/mentor-approvals/${row.id}`}
								className="font-sans text-lg font-medium text-fg underline"
							>
								{row.name}
							</Link>
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{row.kind} · {row.weeklyContactCap}
							</p>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

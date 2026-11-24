import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordTable } from "@/components/ui/record-table";
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
				<EmptyState sentence={t("mentorsApprovalsEmpty")} />
			) : (
				<RecordTable
					caption={t("mentorsApprovals")}
					columns={[t("nameLabel"), t("status"), t("openRow")]}
					rows={items.map((row) => ({
						key: row.id,
						cells: [
							row.name,
							<Badge key="status" variant="pending">
								{row.kind}
							</Badge>,
							<Link
								key="open"
								to={`/mentor-approvals/${row.id}`}
								className="underline"
							>
								{t("openRow")}
							</Link>,
						],
					}))}
				/>
			)}
		</section>
	);
}

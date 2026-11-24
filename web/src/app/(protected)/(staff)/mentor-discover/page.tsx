import { Link } from "react-router";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordTable } from "@/components/ui/record-table";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Learner = {
	id: string;
	name: string;
	skill: string;
	districtName: string;
};

export default function MentorDiscoverPage() {
	const { t } = useI18n();
	const list = useEngine("/mentor-discover");

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<section className="flex max-w-3xl flex-col gap-4">
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("mentorsDiscover")}
				</h1>
				<p className="font-sans text-lg font-medium text-fg">
					{t("mentorsDiscoverDenied")}
				</p>
			</section>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = list.data as { cap: number; used: number; items: Learner[] };

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("mentorsDiscover")}
				</h1>
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{t("mentorsCapUsed", {
						used: String(data.used),
						cap: String(data.cap),
					})}
				</p>
			</div>
			{data.items.length === 0 ? (
				<EmptyState sentence={t("mentorsDiscoverEmpty")} />
			) : (
				<RecordTable
					caption={t("mentorsDiscover")}
					columns={[t("nameLabel"), t("districtLabel"), t("openRow")]}
					rows={data.items.map((row) => ({
						key: row.id,
						cells: [
							row.name,
							`${row.skill} · ${row.districtName}`,
							<Link
								key="open"
								to={`/mentor-discover/${row.id}`}
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

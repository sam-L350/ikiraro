import { Link } from "react-router";
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
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("mentorsDiscoverDenied")}
			</p>
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
				<p className="font-sans text-lg font-medium text-fg">
					{t("mentorsDiscoverEmpty")}
				</p>
			) : (
				<ul>
					{data.items.map((row) => (
						<li key={row.id} className="border-t border-ink/15 py-4">
							<Link
								to={`/mentor-discover/${row.id}`}
								className="font-sans text-lg font-medium text-fg underline"
							>
								{row.name}
							</Link>
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{row.skill} · {row.districtName}
							</p>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

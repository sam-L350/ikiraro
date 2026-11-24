import { Link } from "react-router";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type Post = {
	id: string;
	partnerName: string;
	kind: "job" | "apprenticeship" | "contract" | "training";
	title: string;
	skill: string;
	body: string;
};

function kindKey(kind: Post["kind"]): MessageKey {
	switch (kind) {
		case "job":
			return "opportunitiesJob";
		case "apprenticeship":
			return "opportunitiesApprenticeship";
		case "contract":
			return "opportunitiesContract";
		case "training":
			return "opportunitiesTraining";
		default: {
			const unreachable: never = kind;
			return unreachable;
		}
	}
}

export default function OpportunitiesPage() {
	const { t } = useI18n();
	const board = useEngine("/opportunities");

	if (board.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (board.error || !board.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const matches = (board.data.matches ?? []) as Post[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("opportunitiesTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("opportunitiesSentence")}
				</p>
			</div>
			<Link
				to="/opportunities/post"
				className="font-sans text-lg font-medium text-fg underline"
			>
				{t("opportunitiesPost")}
			</Link>
			{matches.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("opportunitiesEmpty")}
				</p>
			) : (
				<ul>
					{matches.map((row) => (
						<li key={row.id} className="border-t border-ink/15 py-4">
							<p className="font-sans text-lg font-medium text-fg">
								{row.title}
							</p>
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t(kindKey(row.kind))} · {row.skill} · {row.partnerName}
							</p>
							<p className="mt-2 font-sans text-lg font-medium text-fg">
								{row.body}
							</p>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Learner = {
	id: string;
	name: string;
	skill: string;
	districtName: string;
};

export default function MentorAskPage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { id = "" } = useParams();
	const list = useEngine("/mentor-discover");
	const ask = useEngineMutation("/mentor-requests");
	const items = (list.data as { items?: Learner[] } | undefined)?.items ?? [];
	const row = items.find((item) => item.id === id);

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{row ? row.name : t("mentorsDiscover")}
			</h1>
			{row ? (
				<p className="font-sans text-lg font-medium text-fg">
					{row.skill} · {row.districtName}
				</p>
			) : null}
			{row ? (
				<Button
					type="button"
					disabled={ask.isPending}
					onClick={() =>
						ask.mutate(
							{ body: { optInId: id } },
							{ onSuccess: () => void navigate("/mentor-discover") },
						)
					}
				>
					{t("mentorsRequest")}
				</Button>
			) : null}
		</section>
	);
}

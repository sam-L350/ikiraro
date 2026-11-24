import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type RequestRow = {
	id: string;
	mentorName: string;
	skill: string;
	districtName: string;
	status: string;
};

export default function MentorRequestPage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { id = "" } = useParams();
	const own = useEngine("/mentors");
	const accept = useEngineMutation("/mentor-requests/:id/accept");
	const decline = useEngineMutation("/mentor-requests/:id/decline");
	const requests =
		(own.data as { requests?: RequestRow[] } | undefined)?.requests ?? [];
	const row = requests.find((item) => item.id === id);

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{row ? row.mentorName : t("mentorsTitle")}
			</h1>
			{row ? (
				<p className="font-sans text-lg font-medium text-fg">
					{row.skill} · {row.districtName}
				</p>
			) : null}
			{row?.status === "pending" ? (
				<div className="flex gap-3">
					<Button
						type="button"
						disabled={accept.isPending}
						onClick={() =>
							accept.mutate(
								{ body: { id } },
								{ onSuccess: () => void navigate("/mentors") },
							)
						}
					>
						{t("mentorsAccept")}
					</Button>
					<Button
						type="button"
						variant="quiet"
						disabled={decline.isPending}
						onClick={() =>
							decline.mutate(
								{ body: { id } },
								{ onSuccess: () => void navigate("/mentors") },
							)
						}
					>
						{t("mentorsDecline")}
					</Button>
				</div>
			) : null}
		</section>
	);
}

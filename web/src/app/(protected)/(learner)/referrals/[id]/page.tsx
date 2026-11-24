import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Row = { id: string; authorName: string; note: string; shown: boolean };

export default function AllowReferralPage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { id = "" } = useParams();
	const list = useEngine("/referrals");
	const allow = useEngineMutation("/referrals/:id/allow");
	const items = (list.data?.items ?? []) as Row[];
	const row = items.find((item) => item.id === id);

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{row ? row.authorName : t("referralsTitle")}
			</h1>
			{row ? (
				<p className="font-sans text-lg font-medium text-fg">{row.note}</p>
			) : null}
			{row && !row.shown ? (
				<Button
					type="button"
					disabled={allow.isPending}
					onClick={() =>
						allow.mutate(
							{ body: { id } },
							{ onSuccess: () => void navigate("/referrals") },
						)
					}
				>
					{t("referralsAllow")}
				</Button>
			) : null}
		</section>
	);
}

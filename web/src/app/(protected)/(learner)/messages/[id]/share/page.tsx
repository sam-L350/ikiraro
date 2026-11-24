import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export default function ShareContactPage() {
	const { t } = useI18n();
	const { id = "" } = useParams();
	const thread = useEngine(
		"/messages/:id",
		{ query: { id } },
		{ enabled: id !== "" },
	);
	const share = useEngineMutation("/messages/:id/share");
	const shared = Boolean(
		thread.data && "sharedByMe" in thread.data && thread.data.sharedByMe,
	);

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("messagesShare")}
			</h1>
			<p className="font-sans text-lg font-medium text-fg">
				{t("messagesShareSentence")}
			</p>
			{shared ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("messagesShared")}
				</p>
			) : (
				<Button
					type="button"
					disabled={share.isPending}
					onClick={() =>
						share.mutate(
							{ body: { id } },
							{ onSuccess: () => void thread.refetch() },
						)
					}
				>
					{t("messagesShareSend")}
				</Button>
			)}
		</section>
	);
}

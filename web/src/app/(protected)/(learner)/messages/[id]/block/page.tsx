import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export default function BlockMatchPage() {
	const { t } = useI18n();
	const { id = "" } = useParams();
	const thread = useEngine(
		"/messages/:id",
		{ query: { id } },
		{ enabled: id !== "" },
	);
	const block = useEngineMutation("/messages/:id/block");
	const blocked = Boolean(
		thread.data && "blocked" in thread.data && thread.data.blocked,
	);

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("messagesBlock")}
			</h1>
			{blocked ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("messagesBlocked")}
				</p>
			) : (
				<Button
					type="button"
					disabled={block.isPending}
					onClick={() =>
						block.mutate(
							{ body: { id } },
							{ onSuccess: () => void thread.refetch() },
						)
					}
				>
					{t("messagesBlockSend")}
				</Button>
			)}
		</section>
	);
}

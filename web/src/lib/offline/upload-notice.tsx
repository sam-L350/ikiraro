import { useI18n } from "@/lib/i18n";
import { useUploadQueue } from "./use-upload-queue";

/** One sentence while this tab still has attempts waiting for the network. */
export function UploadQueueNotice() {
	const count = useUploadQueue();
	const { t } = useI18n();
	if (count < 1) return null;
	return (
		<p className="mb-6 text-lg text-fg">
			{t("uploadWaiting", { count: String(count) })}
		</p>
	);
}

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { deliverQueued } from "./deliver";
import {
	firstAsk,
	flushQueue,
	keepLocalDraft,
	queueBanner,
	removeQueued,
	subscribeQueue,
} from "./outbox";
import { useUploadQueue } from "./use-upload-queue";

/** The waiting count, a full-device warning, or a draft the learner must choose. */
export function UploadQueueNotice() {
	const count = useUploadQueue();
	const banner = useSyncExternalStore(subscribeQueue, queueBanner, queueBanner);
	const ask = useSyncExternalStore(subscribeQueue, firstAsk, firstAsk);
	const { t } = useI18n();
	if (count < 1 && !banner && !ask) return null;
	return (
		<div className="mb-6 flex flex-col gap-3">
			{count > 0 ? (
				<p className="text-lg text-fg">
					{t("uploadWaiting", { count: String(count) })}
				</p>
			) : null}
			{banner === "capped" ? (
				<p className="text-lg text-fg">{t("uploadCapped")}</p>
			) : null}
			{banner === "server" ? (
				<p className="text-lg text-fg">{t("serverWins")}</p>
			) : null}
			{ask ? (
				<div className="flex flex-col gap-3">
					<p className="text-lg text-fg">{t("draftAsk")}</p>
					<div className="flex flex-wrap gap-3">
						<Button
							type="button"
							variant="quiet"
							onClick={() => {
								keepLocalDraft(ask.id);
								void flushQueue(deliverQueued);
							}}
						>
							{t("draftKeepMine")}
						</Button>
						<Button
							type="button"
							variant="quiet"
							onClick={() => removeQueued(ask.id)}
						>
							{t("draftKeepServer")}
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}

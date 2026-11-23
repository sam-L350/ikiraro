import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type NextStep = {
	enrollmentId: string;
	taskId: string;
	titleEn: string;
	titleRw: string;
	courseTitleEn: string;
	courseTitleRw: string;
};

type CenterHealth = {
	id: string;
	name: string;
	activeLearners: number;
	waitingSubmissions: number;
	medianReviewMinutes: number | null;
};

type SystemHealth = {
	outboxDepth: number;
	failedNotifications: number;
	storageErrors: number;
};

type OperationsSnapshot = {
	includesNext: boolean;
	next: NextStep | null;
	queueDepth: number | null;
	centers: CenterHealth[] | null;
	system: SystemHealth | null;
};

function textFor(locale: "rw" | "en", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
}

function Count({ label, value }: { label: string; value: number }) {
	return (
		<div className="flex flex-col gap-1">
			<p className="font-meta text-xs uppercase text-fg-muted">{label}</p>
			<p className="font-sans text-4xl font-semibold text-fg">{value}</p>
		</div>
	);
}

export default function OperationsPage() {
	const { locale, t } = useI18n();
	const view = useEngine("/operations");

	if (view.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(view.error) && view.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (view.error || !view.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = view.data as OperationsSnapshot;
	const next = data.next;

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-8">
			<div className="flex flex-col gap-2">
				<h1 className="font-sans text-4xl font-semibold text-fg">
					{t("operationsTitle")}
				</h1>
				<p className="font-sans text-lg text-fg-muted">{t("operationsLead")}</p>
			</div>

			{data.includesNext ? (
				<section className="flex flex-col gap-3">
					<h2 className="font-meta text-xs uppercase text-fg-muted">
						{t("operationsNext")}
					</h2>
					{next ? (
						<>
							<p className="text-sm text-fg-muted">
								{textFor(locale, next.courseTitleRw, next.courseTitleEn)}
							</p>
							<p className="font-sans text-3xl font-semibold leading-tight text-fg">
								{textFor(locale, next.titleRw, next.titleEn)}
							</p>
							<Button asChild className="w-fit">
								<Link to={`/tasks/${next.enrollmentId}/${next.taskId}`}>
									{t("continueTask")}
								</Link>
							</Button>
						</>
					) : (
						<p className="font-sans text-2xl text-fg">
							{t("operationsNextEmpty")}
						</p>
					)}
				</section>
			) : null}

			{data.queueDepth !== null ? (
				<section className="flex flex-col gap-3">
					<h2 className="font-meta text-xs uppercase text-fg-muted">
						{t("operationsQueue")}
					</h2>
					<p className="font-sans text-lg text-fg-muted">
						{t("operationsQueueLead")}
					</p>
					<p className="font-sans text-5xl font-semibold text-fg">
						{data.queueDepth}
					</p>
					<Link to="/evidence" className="w-fit text-lg text-fg underline">
						{t("evidenceQueueTitle")}
					</Link>
				</section>
			) : null}

			{data.centers ? (
				<section className="flex flex-col gap-4">
					<h2 className="font-meta text-xs uppercase text-fg-muted">
						{t("operationsCenters")}
					</h2>
					{data.centers.length === 0 ? (
						<p className="font-sans text-2xl text-fg">
							{t("operationsCentersEmpty")}
						</p>
					) : (
						<ul className="flex flex-col gap-6">
							{data.centers.map((center) => (
								<li key={center.id} className="flex flex-col gap-3">
									<h3 className="font-sans text-2xl font-semibold text-fg">
										{center.name}
									</h3>
									<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
										<Count
											label={t("operationsActive")}
											value={center.activeLearners}
										/>
										<Count
											label={t("operationsWaiting")}
											value={center.waitingSubmissions}
										/>
										<div className="flex flex-col gap-1">
											<p className="font-meta text-xs uppercase text-fg-muted">
												{t("operationsMedian")}
											</p>
											<p className="font-sans text-4xl font-semibold text-fg">
												{center.medianReviewMinutes === null
													? t("operationsMedianEmpty")
													: t("operationsMedianMinutes", {
															count: String(center.medianReviewMinutes),
														})}
											</p>
										</div>
									</div>
								</li>
							))}
						</ul>
					)}
				</section>
			) : null}

			{data.system ? (
				<section className="flex flex-col gap-4">
					<h2 className="font-meta text-xs uppercase text-fg-muted">
						{t("operationsSystem")}
					</h2>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<Count
							label={t("operationsOutbox")}
							value={data.system.outboxDepth}
						/>
						<Count
							label={t("operationsFailed")}
							value={data.system.failedNotifications}
						/>
						<Count
							label={t("operationsStorage")}
							value={data.system.storageErrors}
						/>
					</div>
				</section>
			) : null}
		</div>
	);
}

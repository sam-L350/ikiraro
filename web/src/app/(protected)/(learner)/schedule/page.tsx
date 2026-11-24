import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type ScheduleItem = {
	id: string;
	topic: string;
	centerName: string;
	courseTitleRw: string | null;
	courseTitleEn: string | null;
	trainerName: string;
	startsAt: string;
	minutes: number;
	open: boolean;
	attended: boolean;
};

type OpenTour = {
	id: string;
	place: string;
	homeCenter: string;
	topic: string;
	startsAt: string;
	placesLeft: number;
	signedUp: boolean;
};

function courseTitle(
	locale: "rw" | "en",
	rw: string | null,
	en: string | null,
): string | null {
	if (locale === "rw" && rw?.trim()) return rw;
	if (en?.trim()) return en;
	return rw?.trim() || null;
}

function when(locale: "rw" | "en", value: string): string {
	return new Date(value).toLocaleString(locale === "rw" ? "rw-RW" : "en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

export default function SchedulePage() {
	const { locale, t } = useI18n();
	const schedule = useEngine("/schedule");
	const tours = useEngine("/tours/open");
	const signup = useEngineMutation("/tours/signup");
	const [tourError, setTourError] = useState<string | null>(null);

	if (schedule.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(schedule.error) && schedule.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (schedule.error || !schedule.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = (schedule.data.items ?? []) as ScheduleItem[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("scheduleTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("scheduleSentence")}
				</p>
			</div>
			{items.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("scheduleEmpty")}
				</p>
			) : (
				<ul>
					{items.map((item) => {
						const course = courseTitle(
							locale,
							item.courseTitleRw,
							item.courseTitleEn,
						);
						return (
							<li
								key={item.id}
								className="flex flex-col gap-2 border-t border-ink/15 py-4"
							>
								<div className="flex flex-wrap items-center gap-3">
									<Badge variant={item.open ? "pending" : "neutral"}>
										{t(item.open ? "sessionOpen" : "sessionClosed")}
									</Badge>
									{item.attended ? (
										<Badge variant="neutral">{t("sessionPresent")}</Badge>
									) : null}
								</div>
								<p className="font-sans text-lg font-medium text-fg">
									{item.topic}
								</p>
								{course ? (
									<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
										{course}
									</p>
								) : null}
								<p className="font-sans text-sm text-fg">
									{when(locale, item.startsAt)} · {item.centerName}
									{item.trainerName ? ` · ${item.trainerName}` : ""}
								</p>
								{item.open && !item.attended ? (
									<p className="font-sans text-sm text-fg">
										{t("scheduleScan")}
									</p>
								) : null}
							</li>
						);
					})}
				</ul>
			)}
			<section className="flex flex-col gap-3">
				<h2 className="font-meta text-xs uppercase text-fg-muted">
					{t("toursTitle")}
				</h2>
				{tours.isPending ? (
					<div className="h-16 animate-pulse rounded-md bg-surface" />
				) : tours.error || !tours.data ? (
					<p className="text-lg text-destructive">{t("tryAgain")}</p>
				) : (tours.data.sessions ?? []).length === 0 ? (
					<p className="font-sans text-lg font-medium text-fg">
						{t("toursOpenEmpty")}
					</p>
				) : (
					<TourTable
						sessions={(tours.data.sessions ?? []) as OpenTour[]}
						locale={locale}
						inkId={
							((tours.data.sessions ?? []) as OpenTour[]).find(
								(session) => !session.signedUp && session.placesLeft > 0,
							)?.id ?? null
						}
						pending={signup.isPending}
						onSignUp={async (sessionId) => {
							setTourError(null);
							try {
								await signup.mutateAsync({ body: { sessionId } });
								await invalidateEngine("/tours/open");
							} catch (caught) {
								setTourError(
									caught instanceof Error ? caught.message : t("tryAgain"),
								);
							}
						}}
					/>
				)}
				{tourError ? (
					<p className="text-lg text-destructive">{tourError}</p>
				) : null}
			</section>
		</section>
	);
}

function TourTable({
	sessions,
	locale,
	inkId,
	pending,
	onSignUp,
}: {
	sessions: OpenTour[];
	locale: "rw" | "en";
	inkId: string | null;
	pending: boolean;
	onSignUp: (sessionId: string) => Promise<void>;
}) {
	const { t } = useI18n();
	return (
		<table className="w-full border-collapse text-left">
			<thead>
				<tr className="font-meta text-xs uppercase text-fg-muted">
					<th className="border-b border-line py-2 font-semibold">
						{t("toursPlace")}
					</th>
					<th className="border-b border-line py-2 font-semibold">
						{t("toursTopic")}
					</th>
					<th className="border-b border-line py-2 font-semibold">
						{t("toursWhen")}
					</th>
					<th className="border-b border-line py-2 font-semibold" />
				</tr>
			</thead>
			<tbody>
				{sessions.map((session) => (
					<tr key={session.id}>
						<td className="border-b border-line py-3 font-sans text-lg text-fg">
							{session.place}
						</td>
						<td className="border-b border-line py-3 font-sans text-lg text-fg">
							{session.topic}
						</td>
						<td className="border-b border-line py-3 font-sans text-lg text-fg">
							{when(locale, session.startsAt)}
						</td>
						<td className="border-b border-line py-3">
							{session.signedUp ? (
								<Badge variant="neutral">{t("toursSignedUp")}</Badge>
							) : session.placesLeft === 0 ? (
								<Badge variant="danger">{t("sessionFull")}</Badge>
							) : (
								<Button
									type="button"
									variant={session.id === inkId ? "ink" : "quiet"}
									disabled={pending}
									onClick={() => void onSignUp(session.id)}
								>
									{t("toursSignUp")}
								</Button>
							)}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

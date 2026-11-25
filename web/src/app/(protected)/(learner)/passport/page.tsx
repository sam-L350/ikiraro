import { useState } from "react";
import { BadgeMark } from "@/components/public/marks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	callEngine,
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import { PassportShare } from "./share";

type PassportBadge = {
	id: string;
	titleEn: string;
	titleRw: string;
	skillEn: string;
	skillRw: string;
	level: number;
	awardedAt: string;
	expiresAt: string | null;
	credentialToken: string | null;
};

type PassportTask = {
	id: string;
	titleEn: string;
	titleRw: string;
	completedAt: string | null;
};

function levelLabel(
	level: number,
	t: (
		key:
			| "badgeLevelFoundation"
			| "badgeLevelPractitioner"
			| "badgeLevelAdvanced",
	) => string,
): string {
	switch (level) {
		case 1:
			return t("badgeLevelFoundation");
		case 2:
			return t("badgeLevelPractitioner");
		case 3:
			return t("badgeLevelAdvanced");
		default:
			return String(level);
	}
}

export default function PassportPage() {
	const { locale, t } = useI18n();
	const passport = useEngine("/passport");
	const [error, setError] = useState<string | null>(null);

	if (passport.isPending) {
		return (
			<div className="mx-auto max-w-3xl">
				<div className="h-40 animate-pulse rounded-[20px] bg-surface" />
			</div>
		);
	}

	if (isApiClientError(passport.error) && passport.error.status === 403) {
		return (
			<div className="mx-auto max-w-3xl">
				<p className="font-sans text-2xl text-fg">{t("homeUnavailable")}</p>
			</div>
		);
	}

	if (passport.error || !passport.data) {
		return (
			<div className="mx-auto max-w-3xl">
				<p className="font-sans text-lg font-medium text-fg">{t("tryAgain")}</p>
			</div>
		);
	}

	const data = passport.data;
	const badges = data.badges as PassportBadge[];

	async function onDownload(id: string) {
		setError(null);
		try {
			const result = await callEngine("/passport/open-badge", {
				query: { id },
			});
			const blob = new Blob([result.json], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = "open-badge.json";
			link.click();
			URL.revokeObjectURL(url);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}
	const tasks = data.tasks as PassportTask[];
	const referrals = (data.referrals ?? []) as {
		id: string;
		authorName: string;
		note: string;
	}[];

	const time = timeStat(data.verifiedMinutes);

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8">
			<article className="rounded-[20px] bg-surface p-6 sm:p-8">
				<div className="flex items-start gap-4">
					<BadgeMark className="size-20" />
					<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
						{t("passportTitle")}
					</h1>
				</div>
				<ul className="mt-6 grid gap-3 sm:grid-cols-3">
					<Stat label={t(time.label)} value={time.value} />
					<Stat label={t("passportStatPoints")} value={String(data.points)} />
					<Stat
						label={t("passportStatLevel")}
						value={
							data.level === null ? t("passportStatNone") : String(data.level)
						}
					/>
				</ul>
			</article>
			<section className="rounded-[20px] bg-surface p-6">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
					{t("passportBadges")}
				</h2>
				{badges.length === 0 ? (
					<p className="mt-3 font-sans text-lg font-medium text-fg">
						{t("passportBadgesEmpty")}
					</p>
				) : (
					<ul className="mt-4 flex flex-col gap-3">
						{badges.map((badge) => {
							const title = textFor(locale, badge.titleRw, badge.titleEn);
							const expired =
								badge.expiresAt !== null &&
								new Date(badge.expiresAt).getTime() < Date.now();
							return (
								<li
									key={badge.id}
									className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-4"
								>
									<div className="min-w-0">
										<p className="font-sans text-lg font-semibold text-fg">
											{title}
										</p>
										<p className="mt-1 font-sans text-base font-medium text-fg-muted">
											{levelLabel(badge.level, t)}
											{" · "}
											{badge.expiresAt
												? when(badge.expiresAt, locale)
												: t("badgeNoExpiry")}
										</p>
									</div>
									<span className="flex items-center gap-2">
										{expired ? (
											<Badge variant="danger">{t("badgeExpired")}</Badge>
										) : null}
										{badge.credentialToken ? (
											<Button
												type="button"
												variant="quiet"
												onClick={() => void onDownload(badge.id)}
											>
												{t("openBadgeDownload")}
											</Button>
										) : null}
									</span>
								</li>
							);
						})}
					</ul>
				)}
				{error ? (
					<p className="mt-3 font-sans text-base font-medium text-danger">
						{error}
					</p>
				) : null}
			</section>
			<Showcase />
			{referrals.length > 0 ? (
				<section className="rounded-[20px] bg-surface p-6">
					<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
						{t("referralsTitle")}
					</h2>
					<ul className="mt-4 flex flex-col gap-3">
						{referrals.map((row) => (
							<li key={row.id} className="rounded-2xl bg-canvas px-4 py-4">
								<p className="font-sans text-lg font-medium text-fg">
									{row.note}
								</p>
								<p className="mt-1 font-sans text-base font-medium text-fg-muted">
									{row.authorName}
								</p>
							</li>
						))}
					</ul>
				</section>
			) : null}
			<section className="rounded-[20px] bg-surface p-6">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
					{t("passportTasks")}
				</h2>
				{tasks.length === 0 ? (
					<p className="mt-3 font-sans text-lg font-medium text-fg">
						{t("passportTasksEmpty")}
					</p>
				) : (
					<ul className="mt-2">
						{tasks.map((task) => (
							<li
								key={task.id}
								className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0"
							>
								<span className="font-sans text-lg font-medium text-fg">
									{textFor(locale, task.titleRw, task.titleEn)}
								</span>
								{task.completedAt ? (
									<span className="shrink-0 font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
										{when(task.completedAt, locale)}
									</span>
								) : null}
							</li>
						))}
					</ul>
				)}
			</section>
			<PassportShare />
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<li className="rounded-2xl bg-canvas px-4 py-4">
			<p className="font-sans text-3xl font-semibold text-fg">{value}</p>
			<p className="mt-1 font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
				{label}
			</p>
		</li>
	);
}

function timeStat(minutes: number): {
	value: string;
	label: "passportStatMinutes" | "passportStatHours";
} {
	const safe = Math.max(0, minutes);
	const hours = Math.floor(safe / 60);
	if (hours > 0 && safe % 60 === 0) {
		return { value: String(hours), label: "passportStatHours" };
	}
	return { value: String(safe), label: "passportStatMinutes" };
}

function textFor(locale: "en" | "rw", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
}

type ShowcaseItem = {
	submissionId: string;
	titleEn: string;
	titleRw: string;
	evidenceType: string;
	evidenceUrl: string | null;
};

function evidenceName(
	value: string,
	t: (
		key: "evidencePhoto" | "evidenceFile" | "evidenceNote" | "evidenceVoice",
	) => string,
): string {
	switch (value) {
		case "photo":
			return t("evidencePhoto");
		case "file":
			return t("evidenceFile");
		case "note":
			return t("evidenceNote");
		case "voice":
			return t("evidenceVoice");
		default:
			return t("evidenceNote");
	}
}

function Showcase() {
	const { locale, t } = useI18n();
	const list = useEngine("/showcase");
	const pin = useEngineMutation("/showcase/pin");
	const pins = (list.data?.pins ?? []) as ShowcaseItem[];
	const open = (list.data?.open ?? []) as ShowcaseItem[];

	async function onPin(submissionId: string) {
		try {
			await pin.mutateAsync({ body: { submissionId } });
			await invalidateEngine("/showcase");
		} catch {
			return;
		}
	}

	return (
		<section className="rounded-[20px] bg-surface p-6">
			<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
				{t("showcaseTitle")}
			</h2>
			{pins.length === 0 ? (
				<p className="mt-3 font-sans text-lg font-medium text-fg">
					{t("showcaseEmpty")}
				</p>
			) : (
				<ul className="mt-4 grid gap-3 sm:grid-cols-2">
					{pins.map((item) => {
						const title = textFor(locale, item.titleRw, item.titleEn);
						return (
							<li
								key={item.submissionId}
								className="flex flex-col gap-3 rounded-2xl bg-canvas p-4"
							>
								{item.evidenceType === "photo" && item.evidenceUrl ? (
									<img
										src={item.evidenceUrl}
										alt={title}
										className="h-40 w-full rounded-xl object-contain"
									/>
								) : null}
								{item.evidenceType === "voice" && item.evidenceUrl ? (
									<audio className="w-full" controls src={item.evidenceUrl}>
										<track kind="captions" />
									</audio>
								) : null}
								<p className="font-sans text-lg font-semibold text-fg">
									{title}
								</p>
								<Badge variant="neutral">
									{evidenceName(item.evidenceType, t)}
								</Badge>
							</li>
						);
					})}
				</ul>
			)}
			{open.length > 0 ? (
				<ul className="mt-4 border-t border-line">
					{open.map((item) => (
						<li
							key={item.submissionId}
							className="flex items-center justify-between gap-3 py-3"
						>
							<p className="font-sans text-lg font-medium text-fg">
								{textFor(locale, item.titleRw, item.titleEn)}
							</p>
							<Button
								type="button"
								variant="quiet"
								disabled={pin.isPending}
								onClick={() => void onPin(item.submissionId)}
							>
								{t("showcasePin")}
							</Button>
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}

function when(value: string, locale: "en" | "rw"): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString(locale === "rw" ? "rw-RW" : "en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "Africa/Kigali",
	});
}

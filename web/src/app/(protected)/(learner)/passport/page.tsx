import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { callEngine, isApiClientError, useEngine } from "@/lib/engine";
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
			<div className="mx-auto max-w-3xl px-4 py-8">
				<div className="h-16 animate-pulse rounded-md bg-surface" />
			</div>
		);
	}

	if (isApiClientError(passport.error) && passport.error.status === 403) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-8">
				<p className="font-sans text-2xl text-fg">{t("homeUnavailable")}</p>
			</div>
		);
	}

	if (passport.error || !passport.data) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-8">
				<p className="text-lg text-destructive">{t("tryAgain")}</p>
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

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
			<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
				{t("passportTitle")}
			</h1>
			<div className="flex flex-col gap-2">
				<p className="text-lg text-fg">{hoursCopy(data.verifiedMinutes, t)}</p>
				<p className="text-lg text-fg">
					{t("passportPoints", { count: String(data.points) })}
				</p>
				<p className="text-lg text-fg">
					{data.level === null
						? t("passportLevelEmpty")
						: t("passportLevel", { count: String(data.level) })}
				</p>
			</div>
			<section className="flex flex-col gap-3">
				<h2 className="font-meta text-xs uppercase text-fg-muted">
					{t("passportBadges")}
				</h2>
				{badges.length === 0 ? (
					<p className="text-lg text-fg">{t("passportBadgesEmpty")}</p>
				) : (
					<table className="w-full border-collapse text-left">
						<thead>
							<tr className="font-meta text-xs uppercase text-fg-muted">
								<th className="border-b border-line py-2 font-semibold">
									{t("passportBadges")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("badgeLevel")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("licencesExpiry")}
								</th>
								<th className="border-b border-line py-2 font-semibold" />
							</tr>
						</thead>
						<tbody>
							{badges.map((badge) => {
								const title = textFor(locale, badge.titleRw, badge.titleEn);
								const expired =
									badge.expiresAt !== null &&
									new Date(badge.expiresAt).getTime() < Date.now();
								return (
									<tr key={badge.id}>
										<td className="border-b border-line py-3 font-sans text-lg text-fg">
											{title}
										</td>
										<td className="border-b border-line py-3 font-sans text-lg text-fg">
											{levelLabel(badge.level, t)}
										</td>
										<td className="border-b border-line py-3">
											{badge.expiresAt ? (
												<span className="flex items-center gap-2">
													{expired ? (
														<Badge variant="danger">{t("badgeExpired")}</Badge>
													) : null}
													<span className="font-sans text-lg text-fg">
														{when(badge.expiresAt, locale)}
													</span>
												</span>
											) : (
												<span className="font-sans text-lg text-fg">
													{t("badgeNoExpiry")}
												</span>
											)}
										</td>
										<td className="border-b border-line py-3">
											{badge.credentialToken ? (
												<Button
													type="button"
													variant="quiet"
													onClick={() => void onDownload(badge.id)}
												>
													{t("openBadgeDownload")}
												</Button>
											) : null}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
				{error ? <p className="text-lg text-destructive">{error}</p> : null}
			</section>
			{referrals.length > 0 ? (
				<section className="flex flex-col gap-3">
					<h2 className="font-meta text-xs uppercase text-fg-muted">
						{t("referralsTitle")}
					</h2>
					<ul className="flex flex-col gap-4">
						{referrals.map((row) => (
							<li key={row.id}>
								<p className="text-lg text-fg">{row.note}</p>
								<p className="text-lg text-fg-muted">{row.authorName}</p>
							</li>
						))}
					</ul>
				</section>
			) : null}
			<section className="flex flex-col gap-3">
				<h2 className="font-meta text-xs uppercase text-fg-muted">
					{t("passportTasks")}
				</h2>
				{tasks.length === 0 ? (
					<p className="text-lg text-fg">{t("passportTasksEmpty")}</p>
				) : (
					<ul className="flex flex-col">
						{tasks.map((task) => (
							<li
								key={task.id}
								className="flex min-h-11 items-center justify-between gap-3 border-b border-line py-3"
							>
								<span className="text-lg text-fg">
									{textFor(locale, task.titleRw, task.titleEn)}
								</span>
								{task.completedAt ? (
									<span className="text-lg text-fg-muted">
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

function hoursCopy(
	minutes: number,
	t: (
		key:
			| "passportHoursEmpty"
			| "passportHours"
			| "passportMinutes"
			| "passportHoursMinutes",
		vars?: Record<string, string>,
	) => string,
): string {
	if (minutes <= 0) return t("passportHoursEmpty");
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (rest === 0) return t("passportHours", { count: String(hours) });
	if (hours === 0) return t("passportMinutes", { count: String(rest) });
	return t("passportHoursMinutes", {
		hours: String(hours),
		minutes: String(rest),
	});
}

function textFor(locale: "en" | "rw", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
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

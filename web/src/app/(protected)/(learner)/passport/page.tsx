import { Badge } from "@/components/ui/badge";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import { PassportShare } from "./share";

type PassportBadge = {
	id: string;
	titleEn: string;
	titleRw: string;
	skillEn: string;
	skillRw: string;
	awardedAt: string;
};

type PassportTask = {
	id: string;
	titleEn: string;
	titleRw: string;
	completedAt: string | null;
};

export default function PassportPage() {
	const { locale, t } = useI18n();
	const passport = useEngine("/passport");

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
	const tasks = data.tasks as PassportTask[];

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
					<ul className="flex flex-col gap-4">
						{badges.map((badge) => {
							const title = textFor(locale, badge.titleRw, badge.titleEn);
							const skill = textFor(locale, badge.skillRw, badge.skillEn);
							return (
								<li key={badge.id} className="flex flex-col gap-2">
									<Badge variant="verified" className="w-fit">
										{title}
									</Badge>
									<p className="text-lg text-fg">{skill || title}</p>
									<p className="text-lg text-fg-muted">
										{t("passportAwarded", {
											date: when(badge.awardedAt, locale),
										})}
									</p>
								</li>
							);
						})}
					</ul>
				)}
			</section>
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

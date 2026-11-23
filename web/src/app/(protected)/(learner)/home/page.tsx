import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type WaitingStatus = "started" | "not_started" | "locked" | "waiting";

type Enrollment = {
	enrollmentId: string;
	startedAt: string;
	courseTitleEn: string;
	courseTitleRw: string;
	next: {
		taskId: string;
		titleEn: string;
		titleRw: string;
	} | null;
	modules: {
		status: "locked" | "not_started" | "started" | "complete";
		tasks: {
			id: string;
			required: boolean;
			titleEn: string;
			titleRw: string;
			status: "not_started" | "started" | "complete";
		}[];
	}[];
};

export default function LearnerHomePage() {
	const { locale, t } = useI18n();
	const { user } = useAuth();
	const list = useEngine("/enrollments");
	const canCatalog = Boolean(
		user?.roles.some(
			(role) =>
				role.code === "learner" ||
				role.code === "trainer" ||
				role.code === "center_manager",
		),
	);

	if (list.isPending) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-8">
				<div className="h-16 animate-pulse rounded-md bg-surface" />
			</div>
		);
	}

	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-8">
				<p className="font-sans text-2xl text-fg">{t("homeUnavailable")}</p>
			</div>
		);
	}

	if (list.error) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-8">
				<p className="text-lg text-destructive">{t("tryAgain")}</p>
			</div>
		);
	}

	const enrollments = (list.data?.enrollments ?? []) as Enrollment[];
	const focus = pickFocus(enrollments);
	const title = focus?.next
		? textFor(locale, focus.next.titleRw, focus.next.titleEn)
		: "";
	const waiting = focus ? waitingRows(enrollments, focus, locale) : [];

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
			{focus?.next ? (
				<>
					<p className="text-sm text-fg-muted">
						{textFor(locale, focus.courseTitleRw, focus.courseTitleEn)}
					</p>
					<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
						{title}
					</h1>
					<Button asChild className="w-fit">
						<Link to={`/tasks/${focus.enrollmentId}/${focus.next.taskId}`}>
							{t("continueTask")}
							<ArrowRight aria-hidden="true" />
						</Link>
					</Button>
				</>
			) : (
				<>
					<p className="font-sans text-2xl text-fg">
						{enrollments.length > 0 ? t("nextTaskDone") : t("nextTaskEmpty")}
					</p>
					{canCatalog ? (
						<Button asChild className="w-fit">
							<Link to="/catalog">{t("seeCatalog")}</Link>
						</Button>
					) : null}
				</>
			)}
			{waiting.length > 0 ? (
				<section className="flex flex-col gap-2">
					<h2 className="font-meta text-xs uppercase text-fg-muted">
						{t("waitingTitle")}
					</h2>
					<ul className="divide-y divide-line border-y border-line">
						{waiting.map((row) => (
							<li
								key={row.key}
								className="flex min-h-11 items-center justify-between gap-3 py-2"
							>
								{row.href ? (
									<Link to={row.href} className="text-lg text-fg">
										{row.title}
									</Link>
								) : (
									<span className="text-lg text-fg">{row.title}</span>
								)}
								<Badge variant={pillFor(row.status)}>
									{labelFor(row.status, t)}
								</Badge>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</div>
	);
}

function pickFocus(enrollments: readonly Enrollment[]): Enrollment | null {
	const open = enrollments.filter((enrollment) => enrollment.next);
	open.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
	return open[0] ?? null;
}

function waitingRows(
	enrollments: readonly Enrollment[],
	focus: Enrollment,
	locale: "rw" | "en",
) {
	const rows: {
		key: string;
		title: string;
		status: WaitingStatus;
		href: string | null;
	}[] = [];
	for (const enrollment of enrollments) {
		if (enrollment.enrollmentId === focus.enrollmentId) {
			for (const module of enrollment.modules) {
				for (const task of module.tasks) {
					if (!task.required || task.status === "complete") continue;
					if (task.id === focus.next?.taskId) continue;
					const status: WaitingStatus =
						module.status === "locked" ? "locked" : task.status;
					rows.push({
						key: task.id,
						title: textFor(locale, task.titleRw, task.titleEn),
						status,
						href: null,
					});
				}
			}
			continue;
		}
		if (!enrollment.next) continue;
		rows.push({
			key: enrollment.enrollmentId,
			title: textFor(locale, enrollment.next.titleRw, enrollment.next.titleEn),
			status: "waiting",
			href: `/tasks/${enrollment.enrollmentId}/${enrollment.next.taskId}`,
		});
	}
	return rows;
}

function textFor(locale: "rw" | "en", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
}

function pillFor(status: WaitingStatus) {
	switch (status) {
		case "started":
			return "pending" as const;
		case "not_started":
			return "neutral" as const;
		case "locked":
			return "outline" as const;
		case "waiting":
			return "info" as const;
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

function labelFor(
	status: WaitingStatus,
	t: (
		key: "taskStarted" | "taskNotStarted" | "taskLocked" | "taskWaiting",
	) => string,
): string {
	switch (status) {
		case "started":
			return t("taskStarted");
		case "not_started":
			return t("taskNotStarted");
		case "locked":
			return t("taskLocked");
		case "waiting":
			return t("taskWaiting");
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

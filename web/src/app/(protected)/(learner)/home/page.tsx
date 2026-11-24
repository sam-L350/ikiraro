import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { HomeCharts } from "@/components/home/overview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordTable } from "@/components/ui/record-table";
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

type QueueItem = {
	id: string;
	status: "pending" | "in_review";
	submittedAt: string;
	learnerName: string;
	centerName: string;
	taskTitleRw: string;
	taskTitleEn: string;
};

type SessionItem = {
	id: string;
	topic: string;
	centerName: string;
	open: boolean;
	taken: number;
	capacity: number;
};

export default function LearnerHomePage() {
	const { locale, t } = useI18n();
	const { user } = useAuth();
	const codes = user?.roles.map((role) => role.code) ?? [];
	const isLearner = codes.includes("learner");
	const isTrainer = codes.includes("trainer");
	const isManager = codes.includes("center_manager");
	const isCoordinator = codes.includes("district_coordinator");
	const isVerifier = codes.includes("public_verifier");
	const isStaff = codes.some((code) => code !== "learner");
	const canReview = isTrainer || isManager || isCoordinator;
	const canSessions = isTrainer || isManager;
	const canCatalog = isLearner || isTrainer || isManager;
	const list = useEngine("/enrollments", undefined, {
		enabled: canCatalog,
	});
	const evidence = useEngine(
		"/evidence-queue",
		{ query: {} },
		{ enabled: canReview },
	);
	const sessions = useEngine(
		"/center-sessions",
		{ query: {} },
		{ enabled: canSessions },
	);
	const isAdmin = codes.includes("platform_admin");
	const isHardware = codes.includes("hardware_officer");
	const flags = {
		points: canCatalog,
		passport: canCatalog,
		inbox: true,
		followUps: isLearner,
		surveys: isLearner,
		operations: isManager || isCoordinator || isAdmin,
		courses: codes.includes("content_author"),
		reviews: codes.includes("content_reviewer"),
		inventory: isHardware,
		hardware: isHardware,
		decisions: codes.includes("committee_member"),
		equity:
			codes.includes("auditor") ||
			isAdmin ||
			isCoordinator ||
			isManager ||
			isHardware,
		approvals: isAdmin,
		tickets: isAdmin || codes.includes("content_reviewer"),
		mentors: codes.includes("mentor"),
		dormancy: isCoordinator || isAdmin,
		concerns: isCoordinator || isAdmin,
		rounds: isCoordinator || isAdmin,
	};

	if (isStaff && !isLearner) {
		const evidenceItems = (evidence.data?.items ?? []) as QueueItem[];
		const sessionItems = (sessions.data?.items ?? []) as SessionItem[];
		const loading =
			(canReview && evidence.isPending) || (canSessions && sessions.isPending);
		if (loading) {
			return (
				<div className="mx-auto max-w-3xl px-4 py-8">
					<div className="h-16 animate-pulse rounded-md bg-surface" />
				</div>
			);
		}
		const enrollments =
			list.data && !list.error
				? ((list.data.enrollments ?? []) as Enrollment[])
				: [];
		const focus = pickFocus(enrollments);
		return (
			<StaffHome
				evidenceItems={evidenceItems}
				sessionItems={sessionItems}
				enrollments={enrollments}
				focus={focus}
				verifier={isVerifier}
				canCatalog={canCatalog}
				flags={flags}
			/>
		);
	}

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
		<div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
			<h1 className="font-sans text-4xl font-semibold leading-tight text-fg">
				{t("homeOverview")}
			</h1>
			{focus?.next ? (
				<>
					<p className="text-sm text-fg-muted">
						{textFor(locale, focus.courseTitleRw, focus.courseTitleEn)}
					</p>
					<p className="font-sans text-3xl font-semibold leading-tight text-fg sm:text-4xl">
						{title}
					</p>
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
			<HomeCharts
				flags={flags}
				enrollments={enrollments}
				evidence={[]}
				sessions={[]}
			/>
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

function StaffHome({
	evidenceItems,
	sessionItems,
	enrollments,
	focus,
	verifier,
	canCatalog,
	flags,
}: {
	evidenceItems: readonly QueueItem[];
	sessionItems: readonly SessionItem[];
	enrollments: readonly Enrollment[];
	focus: Enrollment | null;
	verifier: boolean;
	canCatalog: boolean;
	flags: Parameters<typeof HomeCharts>[0]["flags"];
}) {
	const { locale, t } = useI18n();
	const evidenceRows = evidenceItems.map((item) => ({
		key: item.id,
		cells: [
			item.learnerName.trim() || t("learnerUnnamed"),
			textFor(locale, item.taskTitleRw, item.taskTitleEn),
			item.centerName,
			homeWaiting(item.submittedAt, t),
			t(item.status === "pending" ? "submissionPending" : "submissionInReview"),
		],
		href: `/evidence/${item.id}`,
	}));
	const sessionRows = sessionItems.map((item) => ({
		key: item.id,
		cells: [item.centerName, item.topic, sessionWord(item, t)],
		href: `/sessions/${item.id}`,
	}));
	const rows = evidenceRows.length > 0 ? evidenceRows : sessionRows;
	const next = focus?.next ? (
		<Button asChild className="w-fit">
			<Link to={`/tasks/${focus.enrollmentId}/${focus.next.taskId}`}>
				{t("continueTask")}
				<ArrowRight aria-hidden="true" />
			</Link>
		</Button>
	) : canCatalog ? (
		<Button asChild className="w-fit">
			<Link to="/catalog">{t("seeCatalog")}</Link>
		</Button>
	) : null;
	const badge = verifier ? (
		<Button asChild className="w-fit">
			<Link to="/verify">{t("checkBadge")}</Link>
		</Button>
	) : null;

	return (
		<div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
			<h1 className="font-sans text-4xl font-semibold leading-tight text-fg">
				{t("homeOverview")}
			</h1>
			<p className="font-sans text-lg font-medium text-fg">
				{t("staffHomeLead")}
			</p>
			<HomeCharts
				flags={flags}
				enrollments={enrollments}
				evidence={evidenceItems}
				sessions={sessionItems}
			/>
			{rows.length === 0 ? (
				<EmptyState sentence={t("homeNothing")} action={badge ?? next} />
			) : (
				<RecordTable
					caption={t("staffHomeLead")}
					columns={
						evidenceItems.length > 0
							? [
									t("nameLabel"),
									t("taskLabel"),
									t("centerLabel"),
									t("waitingTitle"),
									t("status"),
									t("openRow"),
								]
							: [t("centerLabel"), t("nameLabel"), t("status"), t("openRow")]
					}
					rows={rows.map((row, index) => ({
						key: row.key,
						cells: [
							...row.cells,
							index === 0 ? (
								<Button key="open" asChild className="w-fit">
									<Link to={row.href}>{t("openRow")}</Link>
								</Button>
							) : (
								<Link
									key="open"
									to={row.href}
									className="font-sans text-lg text-fg underline"
								>
									{t("openRow")}
								</Link>
							),
						],
					}))}
				/>
			)}
		</div>
	);
}

function sessionWord(
	item: SessionItem,
	t: (key: "sessionFull" | "sessionOpen" | "sessionClosed") => string,
): string {
	if (item.taken >= item.capacity) return t("sessionFull");
	if (item.open) return t("sessionOpen");
	return t("sessionClosed");
}

function homeWaiting(
	submittedAt: string,
	t: (
		key:
			| "waitingJustNow"
			| "waitingMinute"
			| "waitingMinutes"
			| "waitingHour"
			| "waitingHours"
			| "waitingDay"
			| "waitingDays",
		vars?: { count: string },
	) => string,
): string {
	const minutes = Math.max(
		0,
		Math.floor((Date.now() - Date.parse(submittedAt)) / 60_000),
	);
	if (minutes < 1) return t("waitingJustNow");
	if (minutes === 1) return t("waitingMinute");
	if (minutes < 60) return t("waitingMinutes", { count: String(minutes) });
	const hours = Math.floor(minutes / 60);
	if (hours === 1) return t("waitingHour");
	if (hours < 48) return t("waitingHours", { count: String(hours) });
	const days = Math.floor(hours / 24);
	if (days === 1) return t("waitingDay");
	return t("waitingDays", { count: String(days) });
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

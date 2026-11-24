import { BarList, PairBars } from "@/components/ui/bar-list";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type Flags = {
	points: boolean;
	passport: boolean;
	inbox: boolean;
	followUps: boolean;
	surveys: boolean;
	operations: boolean;
	courses: boolean;
	reviews: boolean;
	inventory: boolean;
	hardware: boolean;
	decisions: boolean;
	equity: boolean;
	approvals: boolean;
	tickets: boolean;
	mentors: boolean;
	dormancy: boolean;
	concerns: boolean;
	rounds: boolean;
};

type TaskStatus = "complete" | "started" | "not_started" | "locked";

type Enrollment = {
	modules: {
		status: TaskStatus;
		tasks: { status: "not_started" | "started" | "complete" }[];
	}[];
};

type QueueItem = { status: "pending" | "in_review"; centerName: string };

type SessionItem = { open: boolean; taken: number; capacity: number };

type PointEntry = { amount: number; kind: string };

type PassportBadge = { level: number };

type InboxItem = { readAt: string | null };

type FollowUp = { response: "waiting" | "answered" | "unresponsive" };

type Survey = {
	digitalConfidence: number;
	tasksDigital: number;
	income: number;
	jobsOrCustomers: number;
};

type Course = { status: "draft" | "in_review" | "published" | "retired" };

type Review = { id: string };

type InventoryRow = {
	status:
		| "in_stock"
		| "reserved"
		| "awarded"
		| "in_repair"
		| "lost"
		| "retired";
};

type GrantFlag = { recorded?: boolean; agreed?: boolean; recovered?: boolean };

type Round = {
	id: string;
	title: string;
	quantity: number;
	applications: number;
};

type Funnel = {
	registered: number;
	enrolled: number;
	submitted: number;
	approved: number;
	badges: number;
	applicants: number;
	recipients: number;
	activeAt90Days: number;
};

type Approval = { status: string; mine: boolean };

type Ticket = { status: "open" | "answered" | "closed" };

type Mentor = { districtName: string };

type Alert = { reason: "unanswered" | "not_practicing" };

type Concern = { kind: "misconduct" | "bribery" | "favoritism" };

type AllocationRound = { open: boolean };

const FUNNEL: { key: keyof Funnel; label: MessageKey }[] = [
	{ key: "registered", label: "equityRegistered" },
	{ key: "enrolled", label: "equityEnrolled" },
	{ key: "submitted", label: "equitySubmitted" },
	{ key: "approved", label: "equityApproved" },
	{ key: "badges", label: "equityBadges" },
	{ key: "applicants", label: "equityApplicants" },
	{ key: "recipients", label: "equityRecipients" },
	{ key: "activeAt90Days", label: "equityActive" },
];

function ready<T>(
	enabled: boolean,
	query: { isLoading: boolean; data: T | undefined; error: unknown },
): T | null | undefined {
	if (!enabled || query.error) return null;
	if (query.isLoading || query.data === undefined) return undefined;
	return query.data;
}

export function HomeCharts({
	flags,
	enrollments,
	evidence,
	sessions,
}: {
	flags: Flags;
	enrollments: readonly Enrollment[];
	evidence: readonly QueueItem[];
	sessions: readonly SessionItem[];
}) {
	const { t } = useI18n();
	const points = useEngine("/points/statement", undefined, {
		enabled: flags.points,
	});
	const passport = useEngine("/passport", undefined, {
		enabled: flags.passport,
	});
	const inbox = useEngine("/notifications", undefined, {
		enabled: flags.inbox,
	});
	const followUps = useEngine("/follow-ups", undefined, {
		enabled: flags.followUps,
	});
	const surveys = useEngine("/surveys", undefined, { enabled: flags.surveys });
	const operations = useEngine("/operations", undefined, {
		enabled: flags.operations,
	});
	const courses = useEngine("/courses", undefined, { enabled: flags.courses });
	const reviews = useEngine("/reviews", undefined, { enabled: flags.reviews });
	const inventory = useEngine(
		"/inventory",
		{ query: {} },
		{
			enabled: flags.inventory,
		},
	);
	const handovers = useEngine("/handovers", undefined, {
		enabled: flags.hardware,
	});
	const recovery = useEngine("/recovery", undefined, {
		enabled: flags.hardware,
	});
	const decisions = useEngine("/decisions", undefined, {
		enabled: flags.decisions,
	});
	const equity = useEngine("/equity", undefined, { enabled: flags.equity });
	const approvals = useEngine("/admin-approvals", undefined, {
		enabled: flags.approvals,
	});
	const tickets = useEngine("/tickets", undefined, { enabled: flags.tickets });
	const mentors = useEngine("/mentor-discover", undefined, {
		enabled: flags.mentors,
	});
	const dormancy = useEngine("/dormancy", undefined, {
		enabled: flags.dormancy,
	});
	const concerns = useEngine("/misconduct/queue", undefined, {
		enabled: flags.concerns,
	});
	const rounds = useEngine("/rounds", undefined, { enabled: flags.rounds });
	const open = t("openRow");

	const taskRows = taskChart(enrollments, t);
	const evidenceRows = evidenceChart(evidence, t);
	const sessionRows = sessionChart(sessions, t);
	const pointData = ready(flags.points, points);
	const passportData = ready(flags.passport, passport);
	const inboxData = ready(flags.inbox, inbox);
	const followData = ready(flags.followUps, followUps);
	const surveyData = ready(flags.surveys, surveys);
	const operationData = ready(flags.operations, operations);
	const courseData = ready(flags.courses, courses);
	const reviewData = ready(flags.reviews, reviews);
	const inventoryData = ready(flags.inventory, inventory);
	const handoverData = ready(flags.hardware, handovers);
	const recoveryData = ready(flags.hardware, recovery);
	const decisionData = ready(flags.decisions, decisions);
	const equityData = ready(flags.equity, equity);
	const approvalData = ready(flags.approvals, approvals);
	const ticketData = ready(flags.tickets, tickets);
	const mentorData = ready(flags.mentors, mentors);
	const dormancyData = ready(flags.dormancy, dormancy);
	const concernData = ready(flags.concerns, concerns);
	const roundData = ready(flags.rounds, rounds);

	return (
		<div className="grid gap-4 lg:grid-cols-2">
			{taskRows.length > 0 ? (
				<BarList
					caption={t("waitingTitle")}
					rows={taskRows}
					href="/catalog"
					openLabel={open}
				/>
			) : null}
			{evidenceRows.length > 0 ? (
				<BarList
					caption={t("evidenceQueueTitle")}
					rows={evidenceRows}
					href="/evidence"
					openLabel={open}
				/>
			) : null}
			{sessionRows.length > 0 ? (
				<BarList
					caption={t("sessionsNav")}
					rows={sessionRows}
					href="/sessions"
					openLabel={open}
				/>
			) : null}
			<PointChart data={pointData} />
			<PassportChart data={passportData} />
			<InboxChart data={inboxData} />
			<FollowChart data={followData} />
			<SurveyChart data={surveyData} />
			<OperationsCharts data={operationData} />
			<CourseChart data={courseData} />
			<ReviewChart data={reviewData} />
			<InventoryChart data={inventoryData} />
			<HandoverChart data={handoverData} />
			<RecoveryChart data={recoveryData} />
			<DecisionChart data={decisionData} />
			<EquityChart data={equityData} />
			<ApprovalChart data={approvalData} />
			<TicketChart data={ticketData} />
			<MentorChart data={mentorData} />
			<DormancyChart data={dormancyData} />
			<ConcernChart data={concernData} />
			<RoundChart data={roundData} />
		</div>
	);
}

function taskChart(
	enrollments: readonly Enrollment[],
	t: (key: MessageKey) => string,
) {
	const totals: Record<TaskStatus, number> = {
		complete: 0,
		started: 0,
		not_started: 0,
		locked: 0,
	};
	for (const enrollment of enrollments) {
		for (const module of enrollment.modules) {
			for (const task of module.tasks) {
				const status: TaskStatus =
					module.status === "locked" && task.status !== "complete"
						? "locked"
						: task.status;
				totals[status] += 1;
			}
		}
	}
	if (Object.values(totals).every((value) => value === 0)) return [];
	return [
		{ key: "complete", label: t("homeTaskComplete"), value: totals.complete },
		{ key: "started", label: t("taskStarted"), value: totals.started },
		{
			key: "not_started",
			label: t("taskNotStarted"),
			value: totals.not_started,
		},
		{ key: "locked", label: t("taskLocked"), value: totals.locked },
	];
}

function evidenceChart(
	items: readonly QueueItem[],
	t: (key: MessageKey) => string,
) {
	if (items.length === 0) return [];
	const centers = new Map<string, number>();
	for (const item of items) {
		centers.set(item.centerName, (centers.get(item.centerName) ?? 0) + 1);
	}
	const rows = [
		{
			key: "pending",
			label: t("submissionPending"),
			value: items.filter((item) => item.status === "pending").length,
		},
		{
			key: "in_review",
			label: t("submissionInReview"),
			value: items.filter((item) => item.status === "in_review").length,
		},
	];
	if (centers.size > 1) {
		for (const [name, value] of centers) {
			rows.push({ key: name, label: name, value });
		}
	}
	return rows;
}

function sessionChart(
	items: readonly SessionItem[],
	t: (key: "sessionFull" | "sessionOpen" | "sessionClosed") => string,
) {
	if (items.length === 0) return [];
	let full = 0;
	let open = 0;
	let closed = 0;
	for (const item of items) {
		if (item.taken >= item.capacity) full += 1;
		else if (item.open) open += 1;
		else closed += 1;
	}
	return [
		{ key: "open", label: t("sessionOpen"), value: open },
		{ key: "full", label: t("sessionFull"), value: full },
		{ key: "closed", label: t("sessionClosed"), value: closed },
	];
}

function PointChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const entries = (data as { entries?: PointEntry[] }).entries ?? [];
	if (entries.length === 0) return null;
	const totals = new Map<string, number>();
	for (const entry of entries) {
		totals.set(entry.kind, (totals.get(entry.kind) ?? 0) + entry.amount);
	}
	return (
		<BarList
			caption={t("pointsTitle")}
			rows={[...totals.entries()].map(([kind, value]) => ({
				key: kind,
				label: pointLabel(kind, t),
				value,
			}))}
			href="/points"
			openLabel={t("openRow")}
		/>
	);
}

function pointLabel(kind: string, t: (key: MessageKey) => string): string {
	switch (kind) {
		case "task_approved":
			return t("pointsTask");
		case "module_completed":
			return t("pointsModule");
		case "course_completed":
			return t("pointsCourse");
		case "streak_bonus":
			return t("pointsStreak");
		case "community_contribution":
			return t("pointsCommunity");
		case "manual_adjustment":
			return t("pointsAdjustment");
		case "reversal":
			return t("pointsReversal");
		default:
			return t("pointsOther");
	}
}

function PassportChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const badges = (data as { badges?: PassportBadge[] }).badges ?? [];
	if (badges.length === 0) return null;
	return (
		<BarList
			caption={t("passportNav")}
			rows={[
				{
					key: "1",
					label: t("badgeLevelFoundation"),
					value: badges.filter((badge) => badge.level === 1).length,
				},
				{
					key: "2",
					label: t("badgeLevelPractitioner"),
					value: badges.filter((badge) => badge.level === 2).length,
				},
				{
					key: "3",
					label: t("badgeLevelAdvanced"),
					value: badges.filter((badge) => badge.level === 3).length,
				},
			]}
			href="/passport"
			openLabel={t("openRow")}
		/>
	);
}

function InboxChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!Array.isArray(data) || data.length === 0) return null;
	const items = data as InboxItem[];
	return (
		<BarList
			caption={t("inboxNav")}
			rows={[
				{
					key: "unread",
					label: t("inboxUnread"),
					value: items.filter((item) => item.readAt === null).length,
				},
				{
					key: "read",
					label: t("homeRead"),
					value: items.filter((item) => item.readAt !== null).length,
				},
			]}
			href="/inbox"
			openLabel={t("openRow")}
		/>
	);
}

function FollowChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const items = ((data as { items?: FollowUp[] }).items ?? []) as FollowUp[];
	if (items.length === 0) return null;
	return (
		<BarList
			caption={t("followUpsNav")}
			rows={[
				{
					key: "waiting",
					label: t("followUpsWaiting"),
					value: items.filter((item) => item.response === "waiting").length,
				},
				{
					key: "answered",
					label: t("followUpsAnswered"),
					value: items.filter((item) => item.response === "answered").length,
				},
				{
					key: "silent",
					label: t("followUpsSilent"),
					value: items.filter((item) => item.response === "unresponsive")
						.length,
				},
			]}
			href="/follow-ups"
			openLabel={t("openRow")}
		/>
	);
}

function SurveyChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const pair = data as { baseline: Survey | null; endline: Survey | null };
	if (!pair.baseline && !pair.endline) return null;
	const baseline = pair.baseline;
	const endline = pair.endline;
	return (
		<PairBars
			caption={t("surveysTitle")}
			leftLabel={t("surveysBaseline")}
			rightLabel={t("surveysEndline")}
			rows={[
				{
					key: "confidence",
					label: t("surveysConfidence"),
					left: baseline?.digitalConfidence ?? 0,
					right: endline?.digitalConfidence ?? 0,
				},
				{
					key: "tasks",
					label: t("surveysTasks"),
					left: baseline?.tasksDigital ?? 0,
					right: endline?.tasksDigital ?? 0,
				},
				{
					key: "income",
					label: t("surveysIncome"),
					left: baseline?.income ?? 0,
					right: endline?.income ?? 0,
				},
				{
					key: "jobs",
					label: t("surveysJobs"),
					left: baseline?.jobsOrCustomers ?? 0,
					right: endline?.jobsOrCustomers ?? 0,
				},
			]}
			href="/surveys"
			openLabel={t("openRow")}
		/>
	);
}

function OperationsCharts({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const snapshot = data as {
		centers:
			| {
					id: string;
					name: string;
					activeLearners: number;
					waitingSubmissions: number;
			  }[]
			| null;
		system: {
			outboxDepth: number;
			failedNotifications: number;
			storageErrors: number;
		} | null;
	};
	const centers = snapshot.centers ?? [];
	const system = snapshot.system;
	return (
		<>
			{centers.length > 0 ? (
				<PairBars
					caption={t("operationsCenters")}
					leftLabel={t("operationsActive")}
					rightLabel={t("operationsWaiting")}
					rows={centers.map((center) => ({
						key: center.id,
						label: center.name,
						left: center.activeLearners,
						right: center.waitingSubmissions,
					}))}
					href="/operations"
					openLabel={t("openRow")}
				/>
			) : null}
			{system ? (
				<BarList
					caption={t("operationsSystem")}
					rows={[
						{
							key: "outbox",
							label: t("operationsOutbox"),
							value: system.outboxDepth,
						},
						{
							key: "failed",
							label: t("operationsFailed"),
							value: system.failedNotifications,
						},
						{
							key: "storage",
							label: t("operationsStorage"),
							value: system.storageErrors,
						},
					]}
					href="/operations"
					openLabel={t("openRow")}
				/>
			) : null}
		</>
	);
}

function CourseChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const courses = ((data as { courses?: Course[] }).courses ?? []) as Course[];
	if (courses.length === 0) return null;
	return (
		<BarList
			caption={t("coursesNav")}
			rows={[
				{
					key: "draft",
					label: t("statusDraft"),
					value: courses.filter((course) => course.status === "draft").length,
				},
				{
					key: "in_review",
					label: t("statusInReview"),
					value: courses.filter((course) => course.status === "in_review")
						.length,
				},
				{
					key: "published",
					label: t("statusPublished"),
					value: courses.filter((course) => course.status === "published")
						.length,
				},
				{
					key: "retired",
					label: t("statusRetired"),
					value: courses.filter((course) => course.status === "retired").length,
				},
			]}
			href="/courses"
			openLabel={t("openRow")}
		/>
	);
}

function ReviewChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const queue = data as {
		waiting?: Review[];
		published?: Review[];
		retired?: Review[];
	};
	const waiting = queue.waiting?.length ?? 0;
	const published = queue.published?.length ?? 0;
	const retired = queue.retired?.length ?? 0;
	if (waiting + published + retired === 0) return null;
	return (
		<BarList
			caption={t("reviewsNav")}
			rows={[
				{ key: "waiting", label: t("statusInReview"), value: waiting },
				{ key: "published", label: t("statusPublished"), value: published },
				{ key: "retired", label: t("statusRetired"), value: retired },
			]}
			href="/reviews"
			openLabel={t("openRow")}
		/>
	);
}

function InventoryChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const items = ((data as { items?: InventoryRow[] }).items ??
		[]) as InventoryRow[];
	if (items.length === 0) return null;
	const statuses: { key: InventoryRow["status"]; label: MessageKey }[] = [
		{ key: "in_stock", label: "inventoryInStock" },
		{ key: "reserved", label: "inventoryReserved" },
		{ key: "awarded", label: "inventoryAwarded" },
		{ key: "in_repair", label: "inventoryInRepair" },
		{ key: "lost", label: "inventoryLost" },
		{ key: "retired", label: "inventoryRetired" },
	];
	return (
		<BarList
			caption={t("inventoryNav")}
			rows={statuses.map((status) => ({
				key: status.key,
				label: t(status.label),
				value: items.filter((item) => item.status === status.key).length,
			}))}
			href="/inventory"
			openLabel={t("openRow")}
		/>
	);
}

function HandoverChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const grants = ((data as { grants?: GrantFlag[] }).grants ??
		[]) as GrantFlag[];
	if (grants.length === 0) return null;
	return (
		<BarList
			caption={t("handoverNav")}
			rows={[
				{
					key: "recorded",
					label: t("handoverRecorded"),
					value: grants.filter((grant) => grant.recorded).length,
				},
				{
					key: "waiting",
					label: t("helpWaiting"),
					value: grants.filter((grant) => !grant.recorded).length,
				},
			]}
			href="/handovers"
			openLabel={t("openRow")}
		/>
	);
}

function RecoveryChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const grants = ((data as { grants?: GrantFlag[] }).grants ??
		[]) as GrantFlag[];
	if (grants.length === 0) return null;
	return (
		<BarList
			caption={t("recoveryNav")}
			rows={[
				{
					key: "done",
					label: t("recoveryDone"),
					value: grants.filter((grant) => grant.recovered).length,
				},
				{
					key: "agreed",
					label: t("recoveryAgreed"),
					value: grants.filter((grant) => grant.agreed && !grant.recovered)
						.length,
				},
				{
					key: "waiting",
					label: t("helpWaiting"),
					value: grants.filter((grant) => !grant.agreed && !grant.recovered)
						.length,
				},
			]}
			href="/recovery"
			openLabel={t("openRow")}
		/>
	);
}

function DecisionChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const rounds = ((data as { rounds?: Round[] }).rounds ?? []) as Round[];
	if (rounds.length === 0) return null;
	return (
		<PairBars
			caption={t("decisionsNav")}
			leftLabel={t("roundsQuantity")}
			rightLabel={t("equityApplicants")}
			rows={rounds.map((round) => ({
				key: round.id,
				label: round.title,
				left: round.quantity,
				right: round.applications,
			}))}
			href="/decisions"
			openLabel={t("openRow")}
		/>
	);
}

function EquityChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const funnel = (data as { funnel?: Funnel }).funnel;
	if (!funnel) return null;
	return (
		<BarList
			caption={t("equityNav")}
			rows={FUNNEL.map((step) => ({
				key: step.key,
				label: t(step.label),
				value: funnel[step.key],
			}))}
			href="/equity"
			openLabel={t("openRow")}
		/>
	);
}

function ApprovalChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!Array.isArray(data) || data.length === 0) return null;
	const items = data as Approval[];
	const pending = items.filter((item) => item.status === "pending");
	return (
		<BarList
			caption={t("approvalsNav")}
			rows={[
				{
					key: "mine",
					label: t("approvalsWaiting"),
					value: pending.filter((item) => item.mine).length,
				},
				{
					key: "ready",
					label: t("submissionPending"),
					value: pending.filter((item) => !item.mine).length,
				},
			]}
			href="/approvals"
			openLabel={t("openRow")}
		/>
	);
}

function TicketChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const payload = data as { canAnswer?: boolean; queue?: Ticket[] };
	if (!payload.canAnswer) return null;
	const queue = payload.queue ?? [];
	if (queue.length === 0) return null;
	return (
		<BarList
			caption={t("ticketsNav")}
			rows={[
				{
					key: "open",
					label: t("helpWaiting"),
					value: queue.filter((item) => item.status === "open").length,
				},
				{
					key: "answered",
					label: t("followUpsAnswered"),
					value: queue.filter((item) => item.status === "answered").length,
				},
				{
					key: "closed",
					label: t("helpClosedQuiet"),
					value: queue.filter((item) => item.status === "closed").length,
				},
			]}
			href="/tickets"
			openLabel={t("openRow")}
		/>
	);
}

function MentorChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const payload = data as { items?: Mentor[]; used?: number; cap?: number };
	const items = payload.items ?? [];
	if (items.length === 0) return null;
	const districts = new Map<string, number>();
	for (const item of items) {
		districts.set(
			item.districtName,
			(districts.get(item.districtName) ?? 0) + 1,
		);
	}
	return (
		<BarList
			caption={t("mentorsDiscover")}
			rows={[...districts.entries()].map(([name, value]) => ({
				key: name,
				label: name,
				value,
			}))}
			href="/mentor-discover"
			openLabel={t("openRow")}
		/>
	);
}

function DormancyChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const items = ((data as { items?: Alert[] }).items ?? []) as Alert[];
	if (items.length === 0) return null;
	return (
		<BarList
			caption={t("dormancyNav")}
			rows={[
				{
					key: "unanswered",
					label: t("dormancyAnswering"),
					value: items.filter((item) => item.reason === "unanswered").length,
				},
				{
					key: "not_practicing",
					label: t("dormancyPracticing"),
					value: items.filter((item) => item.reason === "not_practicing")
						.length,
				},
			]}
			href="/dormancy"
			openLabel={t("openRow")}
		/>
	);
}

function ConcernChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!Array.isArray(data) || data.length === 0) return null;
	const items = data as Concern[];
	return (
		<BarList
			caption={t("concernsNav")}
			rows={[
				{
					key: "misconduct",
					label: t("reportMisconduct"),
					value: items.filter((item) => item.kind === "misconduct").length,
				},
				{
					key: "bribery",
					label: t("reportBribery"),
					value: items.filter((item) => item.kind === "bribery").length,
				},
				{
					key: "favoritism",
					label: t("reportFavoritism"),
					value: items.filter((item) => item.kind === "favoritism").length,
				},
			]}
			href="/concerns"
			openLabel={t("openRow")}
		/>
	);
}

function RoundChart({ data }: { data: unknown }) {
	const { t } = useI18n();
	if (!data || typeof data !== "object") return null;
	const items = ((data as { rounds?: AllocationRound[] }).rounds ??
		[]) as AllocationRound[];
	if (items.length === 0) return null;
	return (
		<BarList
			caption={t("roundsNav")}
			rows={[
				{
					key: "open",
					label: t("sessionOpen"),
					value: items.filter((item) => item.open).length,
				},
				{
					key: "closed",
					label: t("sessionClosed"),
					value: items.filter((item) => !item.open).length,
				},
			]}
			href="/rounds"
			openLabel={t("openRow")}
		/>
	);
}

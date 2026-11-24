import {
	Activity,
	BadgeCheck,
	Bell,
	BookOpen,
	Briefcase,
	Calendar,
	CircleHelp,
	ClipboardList,
	Compass,
	Copy,
	FileSearch,
	Flag,
	Gift,
	Home,
	Inbox,
	KeyRound,
	type LucideIcon,
	Map as MapIcon,
	MapPin,
	Megaphone,
	MessageSquare,
	Monitor,
	Package,
	PenLine,
	PieChart,
	Route,
	Scale,
	ScrollText,
	Settings,
	Share2,
	Shield,
	User,
	UserPlus,
	Users,
	Webhook,
} from "lucide-react";
import type { Ref } from "react";
import { NavLink } from "react-router";
import { OpenPreviewButton } from "@/components/dev/role-preview";
import { Wordmark } from "@/components/shell/wordmark";
import { useAuth } from "@/lib/auth";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<string, LucideIcon> = {
	"/home": Home,
	"/profile": User,
	"/inbox": Inbox,
	"/help": CircleHelp,
	"/tickets": CircleHelp,
	"/catalog": BookOpen,
	"/schedule": Calendar,
	"/practice": Monitor,
	"/allocation": Gift,
	"/conditions": ScrollText,
	"/follow-ups": ClipboardList,
	"/surveys": ClipboardList,
	"/stories": BookOpen,
	"/pathways": Route,
	"/placement": Compass,
	"/mentors": Users,
	"/opportunities": Briefcase,
	"/referrals": Share2,
	"/messages": MessageSquare,
	"/passport": BadgeCheck,
	"/points": BadgeCheck,
	"/pulse": Activity,
	"/report": Flag,
	"/operations": Activity,
	"/staff": Users,
	"/register/assisted": UserPlus,
	"/staff/new": UserPlus,
	"/courses": PenLine,
	"/templates": Copy,
	"/reviews": FileSearch,
	"/content-packs": Package,
	"/field-guide": BookOpen,
	"/evidence": FileSearch,
	"/questions": MessageSquare,
	"/sessions": Calendar,
	"/tours": MapIcon,
	"/devices": Monitor,
	"/second-reviews": FileSearch,
	"/appeals": Scale,
	"/feedback": MessageSquare,
	"/quality": Activity,
	"/follow-up-queue": ClipboardList,
	"/survey-queue": ClipboardList,
	"/dormancy": Bell,
	"/coverage": MapPin,
	"/referral-write": PenLine,
	"/mentor-discover": Users,
	"/mentor-approvals": Users,
	"/mentor-review": Shield,
	"/mentor-safeguarding": Shield,
	"/announcements": Megaphone,
	"/approvals": Scale,
	"/adjustments": Settings,
	"/exceptions": Flag,
	"/notification-templates": Copy,
	"/privacy-tools": Shield,
	"/settings": Settings,
	"/webhooks": Webhook,
	"/duplicates": Users,
	"/retention": ScrollText,
	"/audit": ScrollText,
	"/concerns": Flag,
	"/inventory": Package,
	"/licences": KeyRound,
	"/handovers": Package,
	"/recovery": Package,
	"/rounds": Scale,
	"/equity": PieChart,
	"/donor-report": PieChart,
	"/scheduled-report": Calendar,
	"/warnings": Bell,
	"/story-report": BookOpen,
	"/decisions": Scale,
};

function NavIcon({ to }: { to: string }) {
	const Icon = NAV_ICONS[to] ?? CircleHelp;
	return <Icon aria-hidden="true" className="size-4 shrink-0" />;
}

type NavItem = {
	to: string;
	label: MessageKey;
	end?: boolean;
};

function useProductNavItems(): NavItem[] {
	const { user } = useAuth();
	const isStaff = user?.roles.some((role) => role.code !== "learner") ?? false;
	const canWriteCourses =
		user?.roles.some((role) => role.code === "content_author") ?? false;
	const canReviewCourses =
		user?.roles.some((role) => role.code === "content_reviewer") ?? false;
	const canReviewEvidence =
		user?.roles.some(
			(role) =>
				role.code === "trainer" ||
				role.code === "center_manager" ||
				role.code === "district_coordinator",
		) ?? false;
	const canUseCatalog =
		user?.roles.some(
			(role) =>
				role.code === "learner" ||
				role.code === "trainer" ||
				role.code === "center_manager",
		) ?? false;
	const context = useEngine("/staff/context", undefined, { enabled: isStaff });
	const mode = context.data?.mode;
	const canAddStaff = mode === "admin" || mode === "center";

	const items: NavItem[] = [
		{ to: "/home", label: "navHome", end: true },
		{ to: "/profile", label: "yourProfile", end: true },
		{ to: "/inbox", label: "inboxNav" },
		{ to: "/help", label: "helpNav" },
	];
	const canAnswerTickets =
		user?.roles.some(
			(role) =>
				role.code === "platform_admin" || role.code === "content_reviewer",
		) ?? false;
	if (canAnswerTickets) {
		items.push({ to: "/tickets", label: "ticketsNav" });
	}
	if (canUseCatalog) {
		items.push({ to: "/catalog", label: "catalogNav" });
	}
	const isLearner =
		user?.roles.some((role) => role.code === "learner") ?? false;
	if (isLearner) {
		items.push(
			{ to: "/schedule", label: "scheduleNav" },
			{ to: "/practice", label: "practiceNav" },
			{ to: "/allocation", label: "allocationNav" },
			{ to: "/conditions", label: "conditionsNav" },
			{ to: "/follow-ups", label: "followUpsNav" },
			{ to: "/surveys", label: "surveysNav" },
			{ to: "/stories", label: "storiesNav" },
			{ to: "/pathways", label: "pathwaysNav" },
			{ to: "/placement", label: "placementNav" },
			{ to: "/mentors", label: "mentorsNav" },
			{ to: "/opportunities", label: "opportunitiesNav" },
			{ to: "/referrals", label: "referralsNav" },
			{ to: "/messages", label: "messagesNav" },
		);
	}
	const canReadPoints =
		user?.roles.some(
			(role) =>
				role.code === "learner" ||
				role.code === "trainer" ||
				role.code === "center_manager",
		) ?? false;
	if (canReadPoints) {
		items.push(
			{ to: "/passport", label: "passportNav" },
			{ to: "/points", label: "pointsNav" },
		);
	}
	if (user?.roles.some((role) => role.code === "learner")) {
		items.push({ to: "/pulse", label: "pulseNav" });
	}
	const canFileConcern =
		user?.roles.some(
			(role) => role.code === "learner" || role.code === "trainer",
		) ?? false;
	if (canFileConcern) {
		items.push({ to: "/report", label: "reportNav" });
	}
	const canSeeOperations =
		user?.roles.some(
			(role) =>
				role.code === "learner" ||
				role.code === "trainer" ||
				role.code === "center_manager" ||
				role.code === "district_coordinator" ||
				role.code === "platform_admin",
		) ?? false;
	if (canSeeOperations) {
		items.push({ to: "/operations", label: "operationsNav" });
	}
	if (!isStaff) return items;
	items.push(
		{ to: "/staff", label: "staffTitle", end: true },
		{ to: "/register/assisted", label: "registerLearner" },
	);
	if (canAddStaff) {
		items.push({ to: "/staff/new", label: "staffAccounts" });
	}
	if (canWriteCourses) {
		items.push(
			{ to: "/courses", label: "coursesNav" },
			{ to: "/templates", label: "contentTemplatesNav" },
			{ to: "/pathways", label: "pathwaysNav" },
			{ to: "/placement", label: "placementNav" },
		);
	}
	if (canReviewCourses) {
		items.push({ to: "/reviews", label: "reviewsNav" });
	}
	const canPack =
		user?.roles.some(
			(role) => role.code === "trainer" || role.code === "center_manager",
		) ?? false;
	if (canPack) {
		items.push(
			{ to: "/content-packs", label: "contentPacksNav" },
			{ to: "/field-guide", label: "fieldGuideNav" },
		);
	}
	if (canReviewEvidence) {
		items.push(
			{ to: "/evidence", label: "evidenceQueueTitle" },
			{ to: "/questions", label: "taskQuestionsNav" },
			{ to: "/sessions", label: "sessionsNav" },
		);
		if (
			user?.roles.some(
				(role) =>
					role.code === "center_manager" ||
					role.code === "district_coordinator",
			)
		) {
			items.push({ to: "/tours", label: "toursNav" });
		}
		items.push(
			{ to: "/devices", label: "devicesNav" },
			{ to: "/second-reviews", label: "secondReviewsNav" },
			{ to: "/appeals", label: "appealsNav" },
			{ to: "/feedback", label: "feedbackNav" },
			{ to: "/quality", label: "qualityNav" },
			{ to: "/follow-up-queue", label: "followUpsQueue" },
			{ to: "/survey-queue", label: "surveysQueue" },
		);
	}
	const canReadFollowUps =
		user?.roles.some(
			(role) =>
				role.code === "district_coordinator" ||
				role.code === "hardware_officer" ||
				role.code === "platform_admin",
		) ?? false;
	if (canReadFollowUps && !canReviewEvidence) {
		items.push({ to: "/follow-up-queue", label: "followUpsQueue" });
	}
	const canReadDormancy =
		user?.roles.some(
			(role) =>
				role.code === "district_coordinator" || role.code === "platform_admin",
		) ?? false;
	if (canReadDormancy) {
		items.push({ to: "/dormancy", label: "dormancyNav" });
	}
	if (user?.roles.some((role) => role.code === "district_coordinator")) {
		items.push({ to: "/coverage", label: "coverageNav" });
	}
	const canWriteReferral =
		user?.roles.some(
			(role) => role.code === "trainer" || role.code === "district_coordinator",
		) ?? false;
	if (canWriteReferral) {
		items.push({ to: "/referral-write", label: "referralsWriteNav" });
	}
	const canDiscover =
		user?.roles.some((role) => role.code === "mentor") ?? false;
	if (canDiscover) {
		items.push(
			{ to: "/mentor-discover", label: "mentorsDiscoverNav" },
			{ to: "/messages", label: "messagesNav" },
		);
	}
	const canApproveMentors =
		user?.roles.some((role) => role.code === "platform_admin") ?? false;
	if (canApproveMentors) {
		items.push(
			{ to: "/mentor-approvals", label: "mentorsApprovalsNav" },
			{ to: "/mentor-review", label: "messagesReviewNav" },
			{ to: "/mentor-safeguarding", label: "messagesCheckNav" },
		);
	}
	const canAnnounce =
		user?.roles.some(
			(role) =>
				role.code === "center_manager" ||
				role.code === "district_coordinator" ||
				role.code === "platform_admin",
		) ?? false;
	if (canAnnounce) {
		items.push({ to: "/announcements", label: "announcementsNav" });
	}
	const canAdjustPoints =
		user?.roles.some((role) => role.code === "platform_admin") ?? false;
	if (canAdjustPoints) {
		items.push(
			{ to: "/approvals", label: "approvalsNav" },
			{ to: "/adjustments", label: "adjustmentsNav" },
			{ to: "/exceptions", label: "exceptionsNav" },
			{ to: "/quality", label: "qualityNav" },
		);
		if (!canReviewEvidence) {
			items.push({ to: "/feedback", label: "feedbackNav" });
		}
		items.push(
			{ to: "/notification-templates", label: "templatesNav" },
			{ to: "/privacy-tools", label: "privacyToolsNav" },
			{ to: "/settings", label: "settingsNav" },
			{ to: "/webhooks", label: "webhooksNav" },
			{ to: "/duplicates", label: "duplicatesNav" },
			{ to: "/retention", label: "retentionNav" },
		);
	}
	const canReadAudit =
		user?.roles.some(
			(role) =>
				role.code === "auditor" ||
				role.code === "platform_admin" ||
				role.code === "center_manager" ||
				role.code === "district_coordinator",
		) ?? false;
	if (canReadAudit) {
		items.push({ to: "/audit", label: "auditNav" });
	}
	const canReviewConcerns =
		user?.roles.some(
			(role) =>
				role.code === "district_coordinator" || role.code === "platform_admin",
		) ?? false;
	if (canReviewConcerns) {
		items.push({ to: "/concerns", label: "concernsNav" });
	}
	const canManageHardware =
		user?.roles.some((role) => role.code === "hardware_officer") ?? false;
	if (canManageHardware) {
		items.push(
			{ to: "/inventory", label: "inventoryNav" },
			{ to: "/licences", label: "licencesNav" },
			{ to: "/handovers", label: "handoverNav" },
			{ to: "/recovery", label: "recoveryNav" },
		);
	}
	const canOpenRounds =
		user?.roles.some(
			(role) =>
				role.code === "district_coordinator" || role.code === "platform_admin",
		) ?? false;
	if (canOpenRounds) {
		items.push({ to: "/rounds", label: "roundsNav" });
	}
	const canReadEquity =
		user?.roles.some(
			(role) =>
				role.code === "auditor" ||
				role.code === "platform_admin" ||
				role.code === "district_coordinator" ||
				role.code === "center_manager" ||
				role.code === "hardware_officer",
		) ?? false;
	if (canReadEquity) {
		items.push(
			{ to: "/equity", label: "equityNav" },
			{ to: "/donor-report", label: "donorNav" },
			{ to: "/scheduled-report", label: "scheduledReportNav" },
			{ to: "/warnings", label: "warningsNav" },
			{ to: "/story-report", label: "storyReportNav" },
		);
	}
	const canDecideGrants =
		user?.roles.some((role) => role.code === "committee_member") ?? false;
	if (canDecideGrants) {
		items.push({ to: "/decisions", label: "decisionsNav" });
	}
	return items;
}

export function ProductIdentity({
	nameRef,
	onPreview,
}: {
	nameRef?: Ref<HTMLParagraphElement>;
	onPreview: () => void;
}) {
	const { t } = useI18n();
	const { user, isLoading } = useAuth();
	const directory = useEngine("/centers");
	const name = user?.name ?? user?.email ?? "…";
	const roles = user?.roles ?? [];
	const assigned = directory.data?.assigned ?? [];

	return (
		<div className="flex flex-col items-start gap-2">
			<OpenPreviewButton onOpen={onPreview} />
			<p
				ref={nameRef}
				role="status"
				aria-label={isLoading ? undefined : t("signedInAs", { name })}
				className="font-sans text-sm font-semibold text-fg"
			>
				{isLoading ? "…" : name}
			</p>
			{roles.length > 0 ? (
				<ul className="flex flex-wrap gap-1">
					{roles.map((role) => (
						<li key={role.code}>
							<span className="inline-flex rounded-full bg-ink px-3 py-1 font-meta text-xs font-semibold uppercase tracking-wide text-ink-fg">
								{role.name}
							</span>
						</li>
					))}
				</ul>
			) : null}
			{assigned.length > 0 ? (
				<p className="font-sans text-sm text-fg-muted">
					{assigned.map((center) => center.name).join(" · ")}
				</p>
			) : (
				<p className="font-sans text-sm text-fg-muted">{t("centerPending")}</p>
			)}
			{user?.sharedDevice ? (
				<p className="font-sans text-sm font-medium text-fg">
					{t("sharedDeviceNote")}
				</p>
			) : null}
		</div>
	);
}

export function ProductNavLinks({
	layout = "rail",
	onNavigate,
}: {
	layout?: "rail" | "row";
	onNavigate?: () => void;
}) {
	const { t } = useI18n();
	const items = useProductNavItems();

	return (
		<nav aria-label={t("navLabel")}>
			<ul
				className={cn(
					"flex items-start gap-1",
					layout === "row" ? "flex-row flex-wrap" : "flex-col",
				)}
			>
				{items.map((item) => (
					<li key={item.to}>
						<NavLink
							to={item.to}
							end={item.end}
							onClick={onNavigate}
							className={({ isActive }) =>
								cn(
									"inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-sans text-sm font-semibold",
									isActive ? "bg-ink text-ink-fg" : "text-ink hover:bg-surface",
								)
							}
						>
							<NavIcon to={item.to} />
							{t(item.label)}
						</NavLink>
					</li>
				))}
			</ul>
		</nav>
	);
}

/** Desktop rail. The wordmark and the person stay put. The links scroll on their own. */
export function ProductNav({
	nameRef,
	onPreview,
}: {
	nameRef?: Ref<HTMLParagraphElement>;
	onPreview: () => void;
}) {
	return (
		<aside className="hidden h-full w-60 shrink-0 flex-col border-r border-line bg-canvas lg:flex">
			<div className="flex shrink-0 flex-col gap-6 px-5 pt-6">
				<Wordmark />
				<ProductIdentity nameRef={nameRef} onPreview={onPreview} />
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
				<ProductNavLinks />
			</div>
		</aside>
	);
}

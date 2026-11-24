import {
	Activity,
	BadgeCheck,
	Bell,
	BookOpen,
	Briefcase,
	Calendar,
	ChevronDown,
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
import { type Ref, useState } from "react";
import { NavLink, useLocation } from "react-router";
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

type NavGroup =
	| "you"
	| "learning"
	| "center"
	| "content"
	| "mentors"
	| "hardware"
	| "allocation"
	| "reports"
	| "admin";

type NavItem = {
	to: string;
	label: MessageKey;
	end?: boolean;
	group: NavGroup;
};

const GROUP_ORDER: NavGroup[] = [
	"you",
	"learning",
	"center",
	"content",
	"mentors",
	"hardware",
	"allocation",
	"reports",
	"admin",
];

const GROUP_LABEL: Record<NavGroup, MessageKey> = {
	you: "navGroupYou",
	learning: "navGroupLearning",
	center: "navGroupCenter",
	content: "navGroupContent",
	mentors: "navGroupMentors",
	hardware: "navGroupHardware",
	allocation: "navGroupAllocation",
	reports: "navGroupReports",
	admin: "navGroupAdmin",
};

const GROUP_ICON: Record<NavGroup, LucideIcon> = {
	you: User,
	learning: BookOpen,
	center: MapPin,
	content: PenLine,
	mentors: Users,
	hardware: Package,
	allocation: Scale,
	reports: PieChart,
	admin: Settings,
};

function isItemActive(item: NavItem, pathname: string) {
	if (item.end) return pathname === item.to;
	return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

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

	const items: NavItem[] = [];
	function add(group: NavGroup, item: Omit<NavItem, "group">) {
		if (items.some((existing) => existing.to === item.to)) return;
		items.push({ ...item, group });
	}
	add("you", { to: "/home", label: "navHome", end: true });
	add("you", { to: "/profile", label: "yourProfile", end: true });
	add("you", { to: "/inbox", label: "inboxNav" });
	add("you", { to: "/help", label: "helpNav" });
	const canAnswerTickets =
		user?.roles.some(
			(role) =>
				role.code === "platform_admin" || role.code === "content_reviewer",
		) ?? false;
	if (canAnswerTickets) {
		add("you", { to: "/tickets", label: "ticketsNav" });
	}
	if (canUseCatalog) {
		add("learning", { to: "/catalog", label: "catalogNav" });
	}
	const isLearner =
		user?.roles.some((role) => role.code === "learner") ?? false;
	if (isLearner) {
		add("learning", { to: "/schedule", label: "scheduleNav" });
		add("learning", { to: "/practice", label: "practiceNav" });
		add("learning", { to: "/allocation", label: "allocationNav" });
		add("learning", { to: "/conditions", label: "conditionsNav" });
		add("learning", { to: "/follow-ups", label: "followUpsNav" });
		add("learning", { to: "/surveys", label: "surveysNav" });
		add("learning", { to: "/stories", label: "storiesNav" });
		add("learning", { to: "/pathways", label: "pathwaysNav" });
		add("learning", { to: "/placement", label: "placementNav" });
		add("learning", { to: "/mentors", label: "mentorsNav" });
		add("learning", { to: "/opportunities", label: "opportunitiesNav" });
		add("learning", { to: "/referrals", label: "referralsNav" });
		add("learning", { to: "/messages", label: "messagesNav" });
	}
	const canReadPoints =
		user?.roles.some(
			(role) =>
				role.code === "learner" ||
				role.code === "trainer" ||
				role.code === "center_manager",
		) ?? false;
	if (canReadPoints) {
		add("learning", { to: "/passport", label: "passportNav" });
		add("learning", { to: "/points", label: "pointsNav" });
	}
	if (user?.roles.some((role) => role.code === "learner")) {
		add("learning", { to: "/pulse", label: "pulseNav" });
	}
	const canFileConcern =
		user?.roles.some(
			(role) => role.code === "learner" || role.code === "trainer",
		) ?? false;
	if (canFileConcern) {
		add("learning", { to: "/report", label: "reportNav" });
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
		add(isStaff ? "center" : "learning", {
			to: "/operations",
			label: "operationsNav",
		});
	}
	if (!isStaff) return items;
	add("center", { to: "/staff", label: "staffTitle", end: true });
	add("center", { to: "/register/assisted", label: "registerLearner" });
	if (canAddStaff) {
		add("center", { to: "/staff/new", label: "staffAccounts" });
	}
	if (canWriteCourses) {
		add("content", { to: "/courses", label: "coursesNav" });
		add("content", { to: "/templates", label: "contentTemplatesNav" });
		add("content", { to: "/pathways", label: "pathwaysNav" });
		add("content", { to: "/placement", label: "placementNav" });
	}
	if (canReviewCourses) {
		add("content", { to: "/reviews", label: "reviewsNav" });
	}
	const canPack =
		user?.roles.some(
			(role) => role.code === "trainer" || role.code === "center_manager",
		) ?? false;
	if (canPack) {
		add("center", { to: "/content-packs", label: "contentPacksNav" });
		add("center", { to: "/field-guide", label: "fieldGuideNav" });
	}
	if (canReviewEvidence) {
		add("center", { to: "/evidence", label: "evidenceQueueTitle" });
		add("center", { to: "/questions", label: "taskQuestionsNav" });
		add("center", { to: "/sessions", label: "sessionsNav" });
		if (
			user?.roles.some(
				(role) =>
					role.code === "center_manager" ||
					role.code === "district_coordinator",
			)
		) {
			add("center", { to: "/tours", label: "toursNav" });
		}
		add("center", { to: "/devices", label: "devicesNav" });
		add("center", { to: "/second-reviews", label: "secondReviewsNav" });
		add("center", { to: "/appeals", label: "appealsNav" });
		add("center", { to: "/feedback", label: "feedbackNav" });
		add("center", { to: "/quality", label: "qualityNav" });
		add("center", { to: "/follow-up-queue", label: "followUpsQueue" });
		add("center", { to: "/survey-queue", label: "surveysQueue" });
	}
	const canReadFollowUps =
		user?.roles.some(
			(role) =>
				role.code === "district_coordinator" ||
				role.code === "hardware_officer" ||
				role.code === "platform_admin",
		) ?? false;
	if (canReadFollowUps && !canReviewEvidence) {
		add("center", { to: "/follow-up-queue", label: "followUpsQueue" });
	}
	const canReadDormancy =
		user?.roles.some(
			(role) =>
				role.code === "district_coordinator" || role.code === "platform_admin",
		) ?? false;
	if (canReadDormancy) {
		add("center", { to: "/dormancy", label: "dormancyNav" });
	}
	if (user?.roles.some((role) => role.code === "district_coordinator")) {
		add("center", { to: "/coverage", label: "coverageNav" });
	}
	const canWriteReferral =
		user?.roles.some(
			(role) => role.code === "trainer" || role.code === "district_coordinator",
		) ?? false;
	if (canWriteReferral) {
		add("center", { to: "/referral-write", label: "referralsWriteNav" });
	}
	const canDiscover =
		user?.roles.some((role) => role.code === "mentor") ?? false;
	if (canDiscover) {
		add("mentors", { to: "/mentor-discover", label: "mentorsDiscoverNav" });
		add("mentors", { to: "/messages", label: "messagesNav" });
	}
	const canApproveMentors =
		user?.roles.some((role) => role.code === "platform_admin") ?? false;
	if (canApproveMentors) {
		add("mentors", { to: "/mentor-approvals", label: "mentorsApprovalsNav" });
		add("mentors", { to: "/mentor-review", label: "messagesReviewNav" });
		add("mentors", {
			to: "/mentor-safeguarding",
			label: "messagesCheckNav",
		});
	}
	const canAnnounce =
		user?.roles.some(
			(role) =>
				role.code === "center_manager" ||
				role.code === "district_coordinator" ||
				role.code === "platform_admin",
		) ?? false;
	if (canAnnounce) {
		add("center", { to: "/announcements", label: "announcementsNav" });
	}
	const canAdjustPoints =
		user?.roles.some((role) => role.code === "platform_admin") ?? false;
	if (canAdjustPoints) {
		add("admin", { to: "/approvals", label: "approvalsNav" });
		add("admin", { to: "/adjustments", label: "adjustmentsNav" });
		add("admin", { to: "/exceptions", label: "exceptionsNav" });
		add("admin", { to: "/quality", label: "qualityNav" });
		if (!canReviewEvidence) {
			add("admin", { to: "/feedback", label: "feedbackNav" });
		}
		add("admin", { to: "/notification-templates", label: "templatesNav" });
		add("admin", { to: "/privacy-tools", label: "privacyToolsNav" });
		add("admin", { to: "/settings", label: "settingsNav" });
		add("admin", { to: "/webhooks", label: "webhooksNav" });
		add("admin", { to: "/duplicates", label: "duplicatesNav" });
		add("admin", { to: "/retention", label: "retentionNav" });
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
		add("reports", { to: "/audit", label: "auditNav" });
	}
	const canReviewConcerns =
		user?.roles.some(
			(role) =>
				role.code === "district_coordinator" || role.code === "platform_admin",
		) ?? false;
	if (canReviewConcerns) {
		add("reports", { to: "/concerns", label: "concernsNav" });
	}
	const canManageHardware =
		user?.roles.some((role) => role.code === "hardware_officer") ?? false;
	if (canManageHardware) {
		add("hardware", { to: "/inventory", label: "inventoryNav" });
		add("hardware", { to: "/licences", label: "licencesNav" });
		add("hardware", { to: "/handovers", label: "handoverNav" });
		add("hardware", { to: "/recovery", label: "recoveryNav" });
	}
	const canOpenRounds =
		user?.roles.some(
			(role) =>
				role.code === "district_coordinator" || role.code === "platform_admin",
		) ?? false;
	if (canOpenRounds) {
		add("allocation", { to: "/rounds", label: "roundsNav" });
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
		add("reports", { to: "/equity", label: "equityNav" });
		add("reports", { to: "/donor-report", label: "donorNav" });
		add("reports", { to: "/scheduled-report", label: "scheduledReportNav" });
		add("reports", { to: "/warnings", label: "warningsNav" });
		add("reports", { to: "/story-report", label: "storyReportNav" });
	}
	const canDecideGrants =
		user?.roles.some((role) => role.code === "committee_member") ?? false;
	if (canDecideGrants) {
		add("allocation", { to: "/decisions", label: "decisionsNav" });
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

function NavDestination({
	item,
	onNavigate,
}: {
	item: NavItem;
	onNavigate?: () => void;
}) {
	const { t } = useI18n();
	return (
		<NavLink
			to={item.to}
			end={item.end}
			onClick={onNavigate}
			className={({ isActive }) =>
				cn(
					"inline-flex min-h-11 w-full items-center gap-2 rounded-full px-4 font-sans text-sm font-semibold",
					isActive ? "bg-ink text-ink-fg" : "text-ink hover:bg-surface",
				)
			}
		>
			<NavIcon to={item.to} />
			{t(item.label)}
		</NavLink>
	);
}

export function ProductNavLinks({ onNavigate }: { onNavigate?: () => void }) {
	const { t } = useI18n();
	const { pathname } = useLocation();
	const items = useProductNavItems();
	const [toggled, setToggled] = useState<Partial<Record<NavGroup, boolean>>>(
		{},
	);
	const groups = GROUP_ORDER.map((id) => ({
		id,
		items: items.filter((item) => item.group === id),
	})).filter((group) => group.items.length > 0);

	function groupIsOpen(id: NavGroup) {
		if (id in toggled) return toggled[id] === true;
		return items.some(
			(item) => item.group === id && isItemActive(item, pathname),
		);
	}

	return (
		<nav aria-label={t("navLabel")}>
			<ul className="flex flex-col gap-1">
				{groups.map((group) => {
					const open = groupIsOpen(group.id);
					const Icon = GROUP_ICON[group.id];
					const panelId = `nav-group-${group.id}`;
					return (
						<li key={group.id}>
							<button
								type="button"
								className="inline-flex min-h-11 w-full items-center gap-2 rounded-full px-4 font-sans text-sm font-semibold text-ink hover:bg-surface"
								aria-expanded={open}
								aria-controls={panelId}
								onClick={() =>
									setToggled((current) => ({
										...current,
										[group.id]: !open,
									}))
								}
							>
								<Icon aria-hidden="true" className="size-4 shrink-0" />
								<span className="flex-1 text-left">
									{t(GROUP_LABEL[group.id])}
								</span>
								<ChevronDown
									aria-hidden="true"
									className={cn("size-4 shrink-0", open ? "rotate-180" : "")}
								/>
							</button>
							{open ? (
								<ul id={panelId} className="flex flex-col gap-1 pl-3">
									{group.items.map((item) => (
										<li key={item.to}>
											<NavDestination item={item} onNavigate={onNavigate} />
										</li>
									))}
								</ul>
							) : null}
						</li>
					);
				})}
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

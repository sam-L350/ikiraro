import type { Ref } from "react";
import { NavLink } from "react-router";
import { OpenPreviewButton } from "@/components/dev/role-preview";
import { Wordmark } from "@/components/shell/wordmark";
import { useAuth } from "@/lib/auth";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

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
	];
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
		items.push({ to: "/courses", label: "coursesNav" });
	}
	if (canReviewCourses) {
		items.push({ to: "/reviews", label: "reviewsNav" });
	}
	if (canReviewEvidence) {
		items.push(
			{ to: "/evidence", label: "evidenceQueueTitle" },
			{ to: "/sessions", label: "sessionsNav" },
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
}: {
	layout?: "rail" | "row";
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
							className={({ isActive }) =>
								cn(
									"inline-flex min-h-11 items-center rounded-full px-4 font-sans text-sm font-semibold",
									isActive ? "bg-ink text-ink-fg" : "text-fg hover:bg-surface",
								)
							}
						>
							{t(item.label)}
						</NavLink>
					</li>
				))}
			</ul>
		</nav>
	);
}

/** Desktop rail. On a narrow screen the same identity and links sit under the header. */
export function ProductNav({
	nameRef,
	onPreview,
}: {
	nameRef?: Ref<HTMLParagraphElement>;
	onPreview: () => void;
}) {
	return (
		<aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-8 border-r border-line bg-canvas px-5 py-6 lg:flex">
			<Wordmark />
			<ProductIdentity nameRef={nameRef} onPreview={onPreview} />
			<ProductNavLinks />
		</aside>
	);
}

export const ROLE_CODES = [
	"learner",
	"trainer",
	"center_manager",
	"district_coordinator",
	"content_author",
	"content_reviewer",
	"hardware_officer",
	"committee_member",
	"auditor",
	"platform_admin",
	"mentor",
	"public_verifier",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const PERMISSION_CODES = [
	"profile.read.self",
	"submission.review",
	"center.manage",
	"district.manage",
	"content.write",
	"content.publish",
	"hardware.manage",
	"grant.decide",
	"report.read",
	"admin.manage",
	"mentor.connect",
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const ROLE_NAMES: Record<RoleCode, string> = {
	learner: "Learner",
	trainer: "Trainer",
	center_manager: "Center manager",
	district_coordinator: "District coordinator",
	content_author: "Content author",
	content_reviewer: "Content reviewer",
	hardware_officer: "Hardware officer",
	committee_member: "Allocation committee member",
	auditor: "Auditor",
	platform_admin: "Platform admin",
	mentor: "Mentor",
	public_verifier: "Public verifier",
};

export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
	learner: ["profile.read.self"],
	trainer: ["profile.read.self", "submission.review"],
	center_manager: ["center.manage", "submission.review"],
	district_coordinator: ["district.manage", "submission.review"],
	content_author: ["content.write"],
	content_reviewer: ["content.publish"],
	hardware_officer: ["hardware.manage"],
	committee_member: ["grant.decide"],
	auditor: ["report.read"],
	platform_admin: ["admin.manage"],
	mentor: ["mentor.connect"],
	public_verifier: [],
};

export const PERMISSION_DESCRIPTIONS: Record<PermissionCode, string> = {
	"profile.read.self": "Read the signed-in user's own profile",
	"submission.review": "Review evidence at the assigned scope",
	"center.manage": "Manage one learning center",
	"district.manage": "Manage centers in one district",
	"content.write": "Write course drafts",
	"content.publish": "Approve and publish content",
	"hardware.manage": "Manage equipment inventory",
	"grant.decide": "Vote on an allocation round",
	"report.read": "Read aggregated reports",
	"admin.manage": "Manage users, roles, and configuration",
	"mentor.connect": "Request contact with an opted-in learner",
};

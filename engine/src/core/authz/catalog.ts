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

export function isRoleCode(value: string): value is RoleCode {
	return (ROLE_CODES as readonly string[]).includes(value);
}

export const PERMISSION_CODES = [
	"profile.read.self",
	"profile.write.self",
	"submission.review",
	"center.manage",
	"district.manage",
	"content.write",
	"content.publish",
	"learning.read",
	"learning.enroll",
	"learning.progress",
	"hardware.manage",
	"grant.decide",
	"report.read",
	"audit.read",
	"misconduct.file",
	"misconduct.review",
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
	learner: [
		"profile.read.self",
		"profile.write.self",
		"learning.read",
		"learning.enroll",
		"learning.progress",
		"misconduct.file",
	],
	trainer: [
		"profile.read.self",
		"profile.write.self",
		"submission.review",
		"learning.read",
		"learning.enroll",
		"learning.progress",
		"misconduct.file",
	],
	center_manager: [
		"profile.read.self",
		"profile.write.self",
		"center.manage",
		"submission.review",
		"learning.read",
		"learning.enroll",
		"learning.progress",
		"audit.read",
	],
	district_coordinator: [
		"profile.read.self",
		"profile.write.self",
		"district.manage",
		"submission.review",
		"audit.read",
		"misconduct.review",
	],
	content_author: ["profile.read.self", "profile.write.self", "content.write"],
	content_reviewer: [
		"profile.read.self",
		"profile.write.self",
		"content.publish",
	],
	hardware_officer: [
		"profile.read.self",
		"profile.write.self",
		"hardware.manage",
	],
	committee_member: ["profile.read.self", "profile.write.self", "grant.decide"],
	auditor: [
		"profile.read.self",
		"profile.write.self",
		"report.read",
		"audit.read",
	],
	platform_admin: [
		"profile.read.self",
		"profile.write.self",
		"admin.manage",
		"audit.read",
		"misconduct.review",
	],
	mentor: ["profile.read.self", "profile.write.self", "mentor.connect"],
	public_verifier: ["profile.read.self", "profile.write.self"],
};

export const PERMISSION_DESCRIPTIONS: Record<PermissionCode, string> = {
	"profile.read.self": "Read the signed-in user's own profile",
	"profile.write.self": "Update the signed-in user's own profile",
	"submission.review": "Review evidence at the assigned scope",
	"center.manage": "Manage one learning center",
	"district.manage": "Manage centers in one district",
	"content.write": "Write course drafts",
	"content.publish": "Approve and publish content",
	"learning.read": "Read the published course catalog",
	"learning.enroll": "Enroll in a published course",
	"learning.progress": "Read progress on an enrolled course",
	"hardware.manage": "Manage equipment inventory",
	"grant.decide": "Vote on an allocation round",
	"report.read": "Read aggregated reports",
	"audit.read": "Search the audit log inside the viewer's scope",
	"misconduct.file": "File a confidential concern about the reporter's center",
	"misconduct.review":
		"Read a concern from a center the reviewer does not work at",
	"admin.manage": "Manage users, roles, and configuration",
	"mentor.connect": "Request contact with an opted-in learner",
};

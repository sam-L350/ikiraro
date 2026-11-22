const STORAGE_KEY = "ikiraro.preview-role";

export const PREVIEW_ROLES = [
	["learner", "Learner"],
	["trainer", "Trainer"],
	["center_manager", "Center manager"],
	["district_coordinator", "District coordinator"],
	["content_author", "Content author"],
	["content_reviewer", "Content reviewer"],
	["hardware_officer", "Hardware officer"],
	["committee_member", "Allocation committee"],
	["auditor", "Auditor"],
	["platform_admin", "Platform admin"],
	["mentor", "Mentor"],
	["public_verifier", "Public verifier"],
] as const;

export type PreviewRole = (typeof PREVIEW_ROLES)[number][0];

function isPreviewRole(value: string | null): value is PreviewRole {
	return PREVIEW_ROLES.some(([code]) => code === value);
}

export function previewRoleName(role: string | null): string | null {
	const match = PREVIEW_ROLES.find(([code]) => code === role);
	return match ? match[1] : null;
}

export function readPreviewRole(): PreviewRole | null {
	if (!import.meta.env.DEV) return null;
	const stored = sessionStorage.getItem(STORAGE_KEY);
	return isPreviewRole(stored) ? stored : null;
}

export function storePreviewRole(role: PreviewRole): void {
	sessionStorage.setItem(STORAGE_KEY, role);
}

export function clearPreviewRole(): void {
	sessionStorage.removeItem(STORAGE_KEY);
}

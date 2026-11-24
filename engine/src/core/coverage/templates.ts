import { asc, eq } from "drizzle-orm";
import type { Database } from "../../db";
import { contentTemplates } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { ROLE_PERMISSIONS } from "../authz/catalog";
import type { Assignment } from "../authz/decide";
import {
	createCourse,
	createModule,
	createTask,
	isEvidenceType,
} from "../content/author";

type TemplateDb = Pick<
	Database,
	"insert" | "select" | "transaction" | "update"
>;

export type TemplateRow = {
	id: string;
	name: string;
	titleEn: string;
	titleRw: string | null;
	evidenceType: string | null;
};

function canWrite(assignments: readonly Assignment[]): boolean {
	return assignments.some((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes("content.write"),
	);
}

function requireAuthor(assignments: readonly Assignment[]): void {
	if (!canWrite(assignments)) {
		throw errors.forbidden("An author stores a template.", {
			reason: "template",
		});
	}
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value,
	);
}

function requireName(value: string): string {
	const name = value.trim();
	if (name.length < 1 || name.length > 80) {
		throw errors.badRequest("Write the template name.", { reason: "template" });
	}
	return name;
}

function requireTitle(value: string): string {
	const title = value.trim();
	if (title.length < 1 || title.length > 120) {
		throw errors.badRequest("Enter an English title.", {
			reason: "title_required",
		});
	}
	return title;
}

function optionalTitle(value: string | undefined): string | null {
	const title = value?.trim() ?? "";
	if (!title) return null;
	if (title.length > 120) {
		throw errors.badRequest("Write a shorter title.", { reason: "template" });
	}
	return title;
}

function optionalText(value: string | undefined): string | null {
	const text = value?.trim() ?? "";
	if (!text) return null;
	if (text.length > 2000) {
		throw errors.badRequest("Write shorter instructions.", {
			reason: "template",
		});
	}
	return text;
}

function optionalEvidence(value: string | undefined): string | null {
	const evidence = value?.trim() ?? "";
	if (!evidence) return null;
	if (!isEvidenceType(evidence)) {
		throw errors.badRequest(
			"Choose a photo, a file, a note, or a voice note.",
			{ reason: "unknown_evidence" },
		);
	}
	return evidence;
}

/** Templates an author can copy into a draft. */
export async function readTemplates(
	database: TemplateDb,
	assignments: readonly Assignment[],
): Promise<{ templates: TemplateRow[] }> {
	requireAuthor(assignments);
	const rows = await database
		.select({
			id: contentTemplates.id,
			name: contentTemplates.name,
			titleEn: contentTemplates.titleEn,
			titleRw: contentTemplates.titleRw,
			evidenceType: contentTemplates.evidenceType,
		})
		.from(contentTemplates)
		.orderBy(asc(contentTemplates.name));
	return { templates: rows };
}

/** Store a task shape. It does not become a course until someone uses it. */
export async function createTemplate(
	database: TemplateDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		name: string;
		titleEn: string;
		titleRw?: string;
		instructionsEn?: string;
		instructionsRw?: string;
		evidenceType?: string;
		ip?: string;
	},
): Promise<TemplateRow> {
	requireAuthor(input.assignments);
	const name = requireName(input.name);
	const titleEn = requireTitle(input.titleEn);
	const titleRw = optionalTitle(input.titleRw);
	const instructionsEn = optionalText(input.instructionsEn);
	const instructionsRw = optionalText(input.instructionsRw);
	const evidenceType = optionalEvidence(input.evidenceType);
	const [created] = await database
		.insert(contentTemplates)
		.values({
			name,
			titleEn,
			titleRw,
			instructionsEn,
			instructionsRw,
			evidenceType,
			createdByUserId: input.actorId,
		})
		.returning({ id: contentTemplates.id });
	if (!created) throw errors.internal("The template was not stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "template.created",
		targetType: "content_template",
		targetId: created.id,
		ipAddress: input.ip,
	});
	return { id: created.id, name, titleEn, titleRw, evidenceType };
}

/** Copy the template into a new draft course with one task. */
export async function copyTemplate(
	database: TemplateDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		templateId: string;
		ip?: string;
	},
): Promise<{ courseId: string }> {
	requireAuthor(input.assignments);
	if (!isUuid(input.templateId)) {
		throw errors.notFound("This template was not found.");
	}
	const [template] = await database
		.select({
			id: contentTemplates.id,
			titleEn: contentTemplates.titleEn,
			titleRw: contentTemplates.titleRw,
			instructionsEn: contentTemplates.instructionsEn,
			instructionsRw: contentTemplates.instructionsRw,
			evidenceType: contentTemplates.evidenceType,
		})
		.from(contentTemplates)
		.where(eq(contentTemplates.id, input.templateId))
		.limit(1);
	if (!template) throw errors.notFound("This template was not found.");
	const course = await createCourse(database, {
		actorId: input.actorId,
		ip: input.ip ?? "",
		titleEn: template.titleEn,
		titleRw: template.titleRw ?? undefined,
	});
	const withModule = await createModule(database, {
		actorId: input.actorId,
		ip: input.ip ?? "",
		courseId: course.id,
		titleEn: template.titleEn,
		titleRw: template.titleRw ?? undefined,
	});
	const moduleId = withModule.modules[0]?.id;
	if (!moduleId) throw errors.internal("The template was not copied.");
	const drafted = await createTask(database, {
		actorId: input.actorId,
		ip: input.ip ?? "",
		moduleId,
		titleEn: template.titleEn,
		titleRw: template.titleRw ?? undefined,
		instructionsEn: template.instructionsEn ?? undefined,
		instructionsRw: template.instructionsRw ?? undefined,
		evidenceType: template.evidenceType ?? undefined,
	});
	await writeAudit(database, {
		actorId: input.actorId,
		action: "template.used",
		targetType: "content_template",
		targetId: template.id,
		ipAddress: input.ip,
		metadata: { courseId: drafted.id },
	});
	return { courseId: drafted.id };
}

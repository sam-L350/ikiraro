import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTabs } from "@/components/ui/page-tabs";
import { RecordTable } from "@/components/ui/record-table";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

function statusKey(
	status: "draft" | "in_review" | "published" | "retired",
): MessageKey {
	switch (status) {
		case "draft":
			return "statusDraft";
		case "in_review":
			return "statusInReview";
		case "published":
			return "statusPublished";
		case "retired":
			return "statusRetired";
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

export default function CoursesPage() {
	const { t } = useI18n();
	const list = useEngine("/courses");
	const [tab, setTab] = useState<
		"draft" | "in_review" | "published" | "retired"
	>("draft");

	if (list.isLoading) {
		return <div className="h-8 w-48 animate-pulse rounded-full bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("cannotWriteContent")}
			</p>
		);
	}

	const courses = list.data?.courses ?? [];
	const shown = courses.filter((course) => course.status === tab);
	return (
		<section className="max-w-3xl">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
						{t("coursesTitle")}
					</h1>
					<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
						{t("coursesSentence")}
					</p>
				</div>
				{courses.length > 0 ? (
					<Button variant="sticker" asChild>
						<Link to="/courses/new">{t("newCourse")}</Link>
					</Button>
				) : null}
			</div>
			{courses.length === 0 ? (
				<div className="mt-10">
					<EmptyState
						sentence={t("coursesEmpty")}
						action={
							<Button variant="sticker" asChild>
								<Link to="/courses/new">{t("newCourse")}</Link>
							</Button>
						}
					/>
				</div>
			) : (
				<div className="mt-10 flex flex-col gap-6">
					<PageTabs
						label={t("coursesTitle")}
						value={tab}
						onChange={setTab}
						tabs={[
							{ value: "draft", label: t("statusDraft") },
							{ value: "in_review", label: t("statusInReview") },
							{ value: "published", label: t("statusPublished") },
							{ value: "retired", label: t("statusRetired") },
						]}
					/>
					{shown.length === 0 ? (
						<EmptyState sentence={t("coursesEmpty")} />
					) : (
						<RecordTable
							caption={t("coursesTitle")}
							columns={[
								t("nameLabel"),
								t("catalogLanguage"),
								t("status"),
								t("openRow"),
							]}
							rows={shown.map((course) => ({
								key: course.id,
								cells: [
									course.title,
									course.missingKinyarwanda ? t("english") : t("kinyarwanda"),
									<span key="status" className="flex flex-wrap gap-2">
										<Badge variant="neutral">
											{t(statusKey(course.status))}
										</Badge>
										{course.missingKinyarwanda ? (
											<Badge variant="pending">{t("englishFallback")}</Badge>
										) : null}
									</span>,
									<Link
										key="open"
										to={`/courses/${course.id}`}
										className="underline"
									>
										{t("openRow")}
									</Link>,
								],
							}))}
						/>
					)}
				</div>
			)}
		</section>
	);
}

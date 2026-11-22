import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
					<p className="font-sans text-lg font-medium text-fg">
						{t("coursesEmpty")}
					</p>
					<div className="mt-6">
						<Button variant="sticker" asChild>
							<Link to="/courses/new">{t("newCourse")}</Link>
						</Button>
					</div>
				</div>
			) : (
				<ul className="mt-10">
					{courses.map((course) => (
						<li key={course.id} className="border-t border-ink/15 py-5">
							<Link to={`/courses/${course.id}`} className="group block">
								<p className="font-sans text-lg font-semibold text-fg group-hover:underline">
									{course.title}
								</p>
								<div className="mt-3 flex flex-wrap gap-2">
									<Badge variant="neutral">{t(statusKey(course.status))}</Badge>
									{course.missingKinyarwanda ? (
										<Badge variant="pending">{t("englishFallback")}</Badge>
									) : null}
								</div>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

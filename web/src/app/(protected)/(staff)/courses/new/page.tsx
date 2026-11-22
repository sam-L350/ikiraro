import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isApiClientError, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "title_required":
			return "titleRequired";
		default:
			return "tryAgain";
	}
}

export default function NewCoursePage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const create = useEngineMutation("/courses/create");
	const [titleEn, setTitleEn] = useState("");
	const [titleRw, setTitleRw] = useState("");
	const [summaryEn, setSummaryEn] = useState("");
	const [summaryRw, setSummaryRw] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			const course = await create.mutateAsync({
				body: { titleEn, titleRw, summaryEn, summaryRw },
			});
			navigate(`/courses/${course.id}`);
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<section className="max-w-xl">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("newCourse")}
			</h1>
			<form className="mt-8 flex flex-col gap-4" onSubmit={onSubmit}>
				<label className="flex flex-col gap-2" htmlFor="title-en">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("courseTitleEn")}
					</span>
					<Input
						id="title-en"
						className="h-11 focus:border-ink focus:ring-ink/40"
						value={titleEn}
						onChange={(event) => setTitleEn(event.target.value)}
						required
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="title-rw">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("courseTitleRw")}
					</span>
					<Input
						id="title-rw"
						className="h-11 focus:border-ink focus:ring-ink/40"
						value={titleRw}
						onChange={(event) => setTitleRw(event.target.value)}
					/>
					{titleEn.trim() && !titleRw.trim() ? (
						<p className="font-sans text-sm text-fg-muted">
							{t("englishFallback")}
						</p>
					) : null}
				</label>
				<label className="flex flex-col gap-2" htmlFor="summary-en">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("courseSummaryEn")}
					</span>
					<Input
						id="summary-en"
						className="h-11 focus:border-ink focus:ring-ink/40"
						value={summaryEn}
						onChange={(event) => setSummaryEn(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="summary-rw">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("courseSummaryRw")}
					</span>
					<Input
						id="summary-rw"
						className="h-11 focus:border-ink focus:ring-ink/40"
						value={summaryRw}
						onChange={(event) => setSummaryRw(event.target.value)}
					/>
				</label>
				{error ? (
					<p className="font-sans text-sm font-medium text-danger" role="alert">
						{t(error)}
					</p>
				) : null}
				<div>
					<Button type="submit" variant="sticker" disabled={create.isPending}>
						{t("createCourse")}
					</Button>
				</div>
			</form>
		</section>
	);
}

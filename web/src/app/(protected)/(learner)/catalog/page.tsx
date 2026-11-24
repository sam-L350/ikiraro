import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type CatalogQuery = {
	language?: string;
	category?: string;
	sector?: string;
	level?: number;
};

function titleFor(
	locale: "rw" | "en",
	course: { titleEn: string; titleRw: string },
): string {
	if (locale === "rw" && course.titleRw.trim().length > 0)
		return course.titleRw;
	if (course.titleEn.trim().length > 0) return course.titleEn;
	return course.titleRw;
}

export default function CatalogPage() {
	const { t, locale } = useI18n();
	const [language, setLanguage] = useState("");
	const [category, setCategory] = useState("");
	const [sector, setSector] = useState("");
	const [level, setLevel] = useState("");
	const [applied, setApplied] = useState<CatalogQuery>({});
	const [error, setError] = useState<MessageKey | null>(null);
	const list = useEngine("/catalog", { query: applied });

	function onShow(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const trimmed = level.trim();
		if (trimmed.length > 0) {
			const parsed = Number(trimmed);
			if (!Number.isInteger(parsed) || parsed < 1) {
				setError("invalidLevel");
				return;
			}
			setError(null);
			setApplied({
				language: language || undefined,
				category: category.trim() || undefined,
				sector: sector.trim() || undefined,
				level: parsed,
			});
			return;
		}
		setError(null);
		setApplied({
			language: language || undefined,
			category: category.trim() || undefined,
			sector: sector.trim() || undefined,
		});
	}

	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("cannotReadCatalog")}
			</p>
		);
	}

	const courses = list.data?.courses ?? [];

	return (
		<section className="max-w-3xl">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("catalogTitle")}
			</h1>
			<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
				{t("catalogSentence")}
			</p>
			<form
				className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
				onSubmit={onShow}
			>
				<label className="flex flex-col gap-2" htmlFor="catalog-language">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("catalogLanguage")}
					</span>
					<select
						id="catalog-language"
						className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 font-sans text-fg"
						value={language}
						onChange={(event) => setLanguage(event.target.value)}
					>
						<option value="">{t("catalogAny")}</option>
						<option value="rw">Kinyarwanda</option>
						<option value="en">English</option>
					</select>
				</label>
				<label className="flex flex-col gap-2" htmlFor="catalog-category">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("catalogCategory")}
					</span>
					<Input
						id="catalog-category"
						className="h-11"
						value={category}
						onChange={(event) => setCategory(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="catalog-sector">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("catalogSector")}
					</span>
					<Input
						id="catalog-sector"
						className="h-11"
						value={sector}
						onChange={(event) => setSector(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="catalog-level">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("catalogLevel")}
					</span>
					<Input
						id="catalog-level"
						className="h-11"
						inputMode="numeric"
						value={level}
						onChange={(event) => setLevel(event.target.value)}
					/>
				</label>
				{error ? (
					<p className="font-sans text-sm font-medium text-danger">
						{t(error)}
					</p>
				) : null}
				<div>
					<Button type="submit" variant="soft">
						{t("catalogShow")}
					</Button>
				</div>
			</form>
			{list.isLoading ? (
				<div className="mt-10 h-8 w-48 animate-pulse rounded-full bg-surface" />
			) : courses.length === 0 ? (
				<p className="mt-10 font-sans text-lg font-medium text-fg">
					{t("catalogEmpty")}
				</p>
			) : (
				<ul className="mt-10">
					{courses.map((course) => (
						<li key={course.courseId} className="border-t border-ink/15 py-5">
							<Link
								to={`/catalog/${course.courseId}`}
								className="group flex flex-wrap items-center justify-between gap-3"
							>
								<span className="font-sans text-lg font-semibold text-fg group-hover:underline">
									{titleFor(locale, course)}
								</span>
								{course.enrolled ? (
									<Badge variant="verified">{t("enrolled")}</Badge>
								) : null}
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

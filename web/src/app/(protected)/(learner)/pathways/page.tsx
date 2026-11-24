import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invalidateEngine, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

function titleFor(
	locale: "rw" | "en",
	item: { titleEn: string; titleRw: string },
): string {
	if (locale === "rw" && item.titleRw.trim()) return item.titleRw;
	if (item.titleEn.trim()) return item.titleEn;
	return item.titleRw;
}

export default function PathwaysPage() {
	const { locale, t } = useI18n();
	const list = useEngine("/pathways");
	const save = useEngineMutation("/pathways/create");
	const [titleEn, setTitleEn] = useState("");
	const [titleRw, setTitleRw] = useState("");
	const [courseIds, setCourseIds] = useState<string[]>([]);
	const [pick, setPick] = useState("");
	const [formError, setFormError] = useState<string | null>(null);

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = list.data;
	const pathways = data.pathways;
	const firstNext = pathways.find(
		(pathway) => pathway.nextCourseId,
	)?.nextCourseId;
	const ready =
		titleEn.trim() !== "" && titleRw.trim() !== "" && courseIds.length >= 2;

	async function onSave(event: FormEvent) {
		event.preventDefault();
		if (!ready) return;
		setFormError(null);
		try {
			await save.mutateAsync({
				body: {
					titleEn: titleEn.trim(),
					titleRw: titleRw.trim(),
					courseIds,
				},
			});
			setTitleEn("");
			setTitleRw("");
			setCourseIds([]);
			setPick("");
			await invalidateEngine("/pathways");
		} catch (error) {
			setFormError(error instanceof Error ? error.message : t("tryAgain"));
		}
	}

	return (
		<section className="flex max-w-3xl flex-col gap-10">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("pathwaysTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("pathwaysSentence")}
				</p>
			</div>
			{pathways.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("pathwaysEmpty")}
				</p>
			) : (
				<ul className="flex flex-col gap-8">
					{pathways.map((pathway) => (
						<li key={pathway.id} className="flex flex-col gap-3">
							<h2 className="font-sans text-2xl font-semibold text-fg">
								{titleFor(locale, pathway)}
							</h2>
							<ol className="flex flex-col gap-3">
								{pathway.courses.map((course) => {
									const name = titleFor(locale, course);
									const isNext = !data.canWrite && course.id === firstNext;
									return (
										<li
											key={course.id}
											className="flex flex-wrap items-center gap-3"
										>
											<span className="font-meta text-xs font-semibold uppercase text-fg-muted">
												{course.position}
											</span>
											<span className="font-sans text-lg text-fg">{name}</span>
											{course.finished ? (
												<span className="inline-flex rounded-full bg-surface px-3 py-1 font-meta text-xs font-semibold uppercase text-fg">
													{t("pathwaysFinished")}
												</span>
											) : null}
											{isNext ? (
												<Button asChild variant="ink" className="w-fit">
													<Link to={`/catalog/${course.id}`}>
														{t("pathwaysNext")}
													</Link>
												</Button>
											) : null}
										</li>
									);
								})}
							</ol>
						</li>
					))}
				</ul>
			)}
			{data.canWrite ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onSave(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="pathway-en">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("pathwaysTitleEn")}
						</span>
						<Input
							id="pathway-en"
							value={titleEn}
							onChange={(event) => setTitleEn(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="pathway-rw">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("pathwaysTitleRw")}
						</span>
						<Input
							id="pathway-rw"
							value={titleRw}
							onChange={(event) => setTitleRw(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="pathway-course">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("pathwaysCourses")}
						</span>
						<select
							id="pathway-course"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={pick}
							onChange={(event) => setPick(event.target.value)}
						>
							<option value="">{t("pathwaysCourses")}</option>
							{data.courses
								.filter((course) => !courseIds.includes(course.id))
								.map((course) => (
									<option key={course.id} value={course.id}>
										{titleFor(locale, course)}
									</option>
								))}
						</select>
					</label>
					{pick ? (
						<Button
							type="button"
							variant="quiet"
							className="w-fit"
							onClick={() => {
								setCourseIds((current) => [...current, pick]);
								setPick("");
							}}
						>
							{t("pathwaysAdd")}
						</Button>
					) : null}
					{courseIds.length > 0 ? (
						<ol className="flex flex-col gap-2">
							{courseIds.map((id, index) => {
								const course = data.courses.find((item) => item.id === id);
								return (
									<li key={id} className="font-sans text-lg text-fg">
										{index + 1}. {course ? titleFor(locale, course) : id}
									</li>
								);
							})}
						</ol>
					) : null}
					{ready ? (
						<Button type="submit" variant="ink" className="w-fit">
							{t("pathwaysSave")}
						</Button>
					) : null}
					{formError ? (
						<p className="font-sans text-lg text-destructive">{formError}</p>
					) : null}
				</form>
			) : null}
		</section>
	);
}

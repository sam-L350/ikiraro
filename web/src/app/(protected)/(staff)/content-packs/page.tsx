import { useState } from "react";
import { Button } from "@/components/ui/button";
import { callEngine, isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Center = { id: string; name: string };
type Course = { id: string; titleEn: string; titleRw: string };
type PackList = { centers: Center[]; courses: Course[] };

export default function ContentPacksPage() {
	const { locale, t } = useI18n();
	const packs = useEngine("/content-packs");
	const [centerId, setCenterId] = useState("");
	const [courseId, setCourseId] = useState("");
	const ready = centerId !== "" && courseId !== "";

	async function onDownload() {
		if (!ready) return;
		const result = await callEngine("/content-packs/download", {
			query: { centerId, courseId },
		});
		const blob = new Blob([result.file], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "ikiraro-course-pack.json";
		link.click();
		URL.revokeObjectURL(url);
	}

	if (packs.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(packs.error) && packs.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("contentPacksDenied")}
			</p>
		);
	}
	if (packs.error || !packs.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = packs.data as PackList;
	const courses = data.courses.filter((course) => course.id !== "");

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("contentPacksTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("contentPacksSentence")}
				</p>
			</div>
			{courses.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("contentPacksEmpty")}
				</p>
			) : (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						void onDownload();
					}}
				>
					<label className="flex flex-col gap-2" htmlFor="pack-center">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("contentPacksCenter")}
						</span>
						<select
							id="pack-center"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={centerId}
							onChange={(event) => setCenterId(event.target.value)}
						>
							<option value="">{t("contentPacksCenter")}</option>
							{data.centers.map((center) => (
								<option key={center.id} value={center.id}>
									{center.name}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-2" htmlFor="pack-course">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("contentPacksCourse")}
						</span>
						<select
							id="pack-course"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={courseId}
							onChange={(event) => setCourseId(event.target.value)}
						>
							<option value="">{t("contentPacksCourse")}</option>
							{courses.map((course) => (
								<option key={course.id} value={course.id}>
									{locale === "rw" && course.titleRw
										? course.titleRw
										: course.titleEn || course.titleRw}
								</option>
							))}
						</select>
					</label>
					{ready ? (
						<Button type="submit" variant="quiet" className="w-fit">
							{t("contentPacksDownload")}
						</Button>
					) : null}
				</form>
			)}
		</section>
	);
}

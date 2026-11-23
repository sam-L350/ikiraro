import { type FormEvent, useState } from "react";
import { useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "already_enrolled":
			return "alreadyEnrolled";
		case "center_required":
			return "centerRequired";
		case "wrong_center":
			return "wrongCenter";
		case "not_published":
			return "notPublishedCatalog";
		case "invalid_language":
			return "invalidLanguage";
		default:
			return "tryAgain";
	}
}

function titleFor(
	locale: "rw" | "en",
	course: { titleEn: string; titleRw: string },
): string {
	if (locale === "rw" && course.titleRw.trim().length > 0)
		return course.titleRw;
	if (course.titleEn.trim().length > 0) return course.titleEn;
	return course.titleRw;
}

function summaryFor(
	locale: "rw" | "en",
	course: { summaryEn: string; summaryRw: string },
): string {
	if (locale === "rw" && course.summaryRw.trim().length > 0) {
		return course.summaryRw;
	}
	if (course.summaryEn.trim().length > 0) return course.summaryEn;
	return course.summaryRw;
}

export default function CatalogCoursePage() {
	const { t, locale } = useI18n();
	const { user } = useAuth();
	const params = useParams();
	const id = params.id ?? "";
	const course = useEngine(
		"/catalog/:id",
		{ query: { id } },
		{ enabled: id.length > 0 },
	);
	const enroll = useEngineMutation("/catalog/:id/enroll");
	const isLearner =
		user?.roles.some((role) => role.code === "learner") ?? false;
	const canEnrollOthers =
		user?.roles.some(
			(role) => role.code === "trainer" || role.code === "center_manager",
		) ?? false;
	const centers = useEngine("/centers", undefined, {
		enabled: canEnrollOthers,
	});
	const assigned = centers.data?.assigned ?? [];
	const [pickedCenter, setPickedCenter] = useState("");
	const centerId = pickedCenter || assigned[0]?.id || "";
	const learners = useEngine(
		"/catalog/learners",
		{ query: { centerId } },
		{ enabled: canEnrollOthers && centerId.length > 0 },
	);
	const [learnerId, setLearnerId] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	if (course.isLoading) {
		return <div className="h-8 w-48 animate-pulse rounded-full bg-surface" />;
	}
	if (isApiClientError(course.error) && course.error.status === 403) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("cannotReadCatalog")}
			</p>
		);
	}
	if (!course.data) {
		return (
			<p className="font-sans text-lg font-medium text-fg">{t("tryAgain")}</p>
		);
	}

	const detail = course.data;
	const selfSticker = isLearner && !detail.enrolled;
	const trainerIsSticker = canEnrollOthers && !selfSticker;

	async function onSelfEnroll(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await enroll.mutateAsync({ body: { id } });
			await course.invalidate();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	async function onEnrollLearner(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		const chosen = Number(learnerId);
		if (!Number.isInteger(chosen) || chosen < 1 || centerId.length === 0) {
			setError("centerRequired");
			return;
		}
		try {
			await enroll.mutateAsync({
				body: { id, learnerId: chosen, centerId },
			});
			await course.invalidate();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<section className="max-w-3xl">
			<div className="flex flex-wrap items-center gap-3">
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{titleFor(locale, detail)}
				</h1>
				{detail.enrolled ? (
					<Badge variant="verified">{t("enrolled")}</Badge>
				) : null}
			</div>
			{summaryFor(locale, detail) ? (
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{summaryFor(locale, detail)}
				</p>
			) : null}
			<ul className="mt-6 flex flex-wrap gap-2">
				{detail.category ? (
					<li>
						<Badge variant="neutral">{detail.category}</Badge>
					</li>
				) : null}
				{detail.economicSector ? (
					<li>
						<Badge variant="neutral">{detail.economicSector}</Badge>
					</li>
				) : null}
				<li>
					<Badge variant="info">
						{t("catalogLevel")} {detail.level}
					</Badge>
				</li>
			</ul>
			{error ? (
				<p className="mt-6 font-sans text-sm font-medium text-danger">
					{t(error)}
				</p>
			) : null}
			{selfSticker ? (
				<form className="mt-8" onSubmit={onSelfEnroll}>
					<Button type="submit" variant="sticker" disabled={enroll.isPending}>
						{t("enroll")}
					</Button>
				</form>
			) : null}
			{canEnrollOthers ? (
				<form className="mt-8 flex flex-col gap-4" onSubmit={onEnrollLearner}>
					{assigned.length > 1 ? (
						<label className="flex flex-col gap-2" htmlFor="enroll-center">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("centerLabel")}
							</span>
							<select
								id="enroll-center"
								className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 font-sans text-fg"
								value={centerId}
								onChange={(event) => {
									setPickedCenter(event.target.value);
									setLearnerId("");
								}}
							>
								{assigned.map((center) => (
									<option key={center.id} value={center.id}>
										{center.name}
									</option>
								))}
							</select>
						</label>
					) : null}
					<label className="flex flex-col gap-2" htmlFor="enroll-learner">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("chooseLearner")}
						</span>
						<select
							id="enroll-learner"
							className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 font-sans text-fg"
							value={learnerId}
							onChange={(event) => setLearnerId(event.target.value)}
						>
							<option value="">{t("catalogAny")}</option>
							{(learners.data?.learners ?? []).map((learner) => (
								<option key={learner.id} value={learner.id}>
									{learner.name || t("chooseLearner")}
								</option>
							))}
						</select>
					</label>
					{(learners.data?.learners.length ?? 0) === 0 &&
					!learners.isLoading ? (
						<p className="font-sans text-sm text-fg-muted">{t("noLearners")}</p>
					) : null}
					<div>
						<Button
							type="submit"
							variant={trainerIsSticker ? "sticker" : "soft"}
							disabled={enroll.isPending}
						>
							{t("enrollLearner")}
						</Button>
					</div>
				</form>
			) : null}
		</section>
	);
}

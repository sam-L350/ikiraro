import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type Applicant = {
	applicationId: string;
	learnerName: string;
	statement: string;
	rank: number | null;
	score: number | null;
};

type DecisionDetail = {
	id: string;
	title: string;
	districtName: string;
	quantity: number;
	balance: {
		gender?: { label: string; target: number; awarded: number };
		youth?: { maxAge: number; target: number; awarded: number };
	} | null;
	applicants: Applicant[];
};

function optionalCount(value: string): number | null {
	const text = value.trim();
	if (text === "") return null;
	const parsed = Number(text);
	if (!Number.isInteger(parsed) || parsed < 0) return null;
	return parsed;
}

function requiredWeight(value: string): number | null {
	const parsed = optionalCount(value);
	if (parsed === null || parsed > 1000) return null;
	return parsed;
}

export default function DecisionRoundPage() {
	const { t } = useI18n();
	const online = useOnline();
	const { id = "" } = useParams();
	const round = useEngine(
		"/decisions/:id",
		{ query: { id } },
		{ enabled: Boolean(id) },
	);
	const rank = useEngineMutation("/decisions/:id/rank");
	const [points, setPoints] = useState("");
	const [badges, setBadges] = useState("");
	const [hours, setHours] = useState("");
	const [attendance, setAttendance] = useState("");
	const [months, setMonths] = useState("");
	const [tieBreak, setTieBreak] = useState("");
	const [quota, setQuota] = useState("");
	const [gender, setGender] = useState("");
	const [genderCount, setGenderCount] = useState("");
	const [youthAge, setYouthAge] = useState("");
	const [youthCount, setYouthCount] = useState("");
	const [onePerHousehold, setOnePerHousehold] = useState(false);
	const [blockActiveGrant, setBlockActiveGrant] = useState(false);
	const [error, setError] = useState<MessageKey | null>(null);
	const detail = round.data as DecisionDetail | undefined;

	async function onRank(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		const weight = {
			points: requiredWeight(points),
			badges: requiredWeight(badges),
			hours: requiredWeight(hours),
			attendance: requiredWeight(attendance),
			months: requiredWeight(months),
		};
		if (
			!online ||
			!detail ||
			weight.points === null ||
			weight.badges === null ||
			weight.hours === null ||
			weight.attendance === null ||
			weight.months === null ||
			(tieBreak !== "none" && tieBreak !== "earlier_application")
		) {
			setError("tryAgain");
			return;
		}
		const formula: {
			weights: {
				points: number;
				badges: number;
				hours: number;
				attendance: number;
				months: number;
			};
			tieBreak: "none" | "earlier_application";
			onePerHousehold: boolean;
			blockActiveGrant: boolean;
			quota?: number;
			genderTarget?: { gender: string; count: number };
			youthTarget?: { maxAge: number; count: number };
		} = {
			weights: {
				points: weight.points,
				badges: weight.badges,
				hours: weight.hours,
				attendance: weight.attendance,
				months: weight.months,
			},
			tieBreak,
			onePerHousehold,
			blockActiveGrant,
		};
		const quotaValue = optionalCount(quota);
		if (quota.trim() !== "" && (quotaValue === null || quotaValue < 1)) {
			setError("tryAgain");
			return;
		}
		if (quotaValue !== null && quotaValue >= 1) formula.quota = quotaValue;
		const genderValue = optionalCount(genderCount);
		if (gender.trim() !== "" || genderCount.trim() !== "") {
			if (!gender.trim() || genderValue === null || genderValue < 1) {
				setError("tryAgain");
				return;
			}
			formula.genderTarget = { gender: gender.trim(), count: genderValue };
		}
		const ageValue = optionalCount(youthAge);
		const youthValue = optionalCount(youthCount);
		if (youthAge.trim() !== "" || youthCount.trim() !== "") {
			if (
				ageValue === null ||
				ageValue < 1 ||
				youthValue === null ||
				youthValue < 1
			) {
				setError("tryAgain");
				return;
			}
			formula.youthTarget = { maxAge: ageValue, count: youthValue };
		}
		try {
			await rank.mutateAsync({ body: { id: detail.id, formula } });
			await round.invalidate();
		} catch {
			setError("tryAgain");
		}
	}

	if (!id || round.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(round.error) && round.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("decisionsDenied")}
			</p>
		);
	}
	if (round.error || !detail) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("roundsMissing")}
			</p>
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<Link
					to="/decisions"
					className="font-sans text-sm font-semibold text-fg"
				>
					{t("decisionsTitle")}
				</Link>
				<h1 className="mt-3 font-sans text-4xl font-semibold text-balance text-fg">
					{detail.title}
				</h1>
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{detail.districtName} ·{" "}
					{t("allocationItems", { count: String(detail.quantity) })}
				</p>
				{detail.balance?.gender ? (
					<p className="mt-2 font-sans text-lg font-medium text-fg">
						{t("decisionsBalanceGender", {
							label: detail.balance.gender.label,
							awarded: String(detail.balance.gender.awarded),
							target: String(detail.balance.gender.target),
						})}
					</p>
				) : null}
				{detail.balance?.youth ? (
					<p className="mt-2 font-sans text-lg font-medium text-fg">
						{t("decisionsBalanceYouth", {
							age: String(detail.balance.youth.maxAge),
							awarded: String(detail.balance.youth.awarded),
							target: String(detail.balance.youth.target),
						})}
					</p>
				) : null}
			</div>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void onRank(event)}
			>
				<div className="grid gap-4 sm:grid-cols-2">
					{(
						[
							["points", points, setPoints, "decisionsWeightPoints"],
							["badges", badges, setBadges, "decisionsWeightBadges"],
							["hours", hours, setHours, "decisionsWeightHours"],
							[
								"attendance",
								attendance,
								setAttendance,
								"decisionsWeightAttendance",
							],
							["months", months, setMonths, "decisionsWeightMonths"],
						] as const
					).map(([key, value, setValue, label]) => (
						<label
							key={key}
							className="flex flex-col gap-2"
							htmlFor={`weight-${key}`}
						>
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t(label)}
							</span>
							<input
								id={`weight-${key}`}
								inputMode="numeric"
								className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
								value={value}
								onChange={(event) => setValue(event.target.value)}
							/>
						</label>
					))}
				</div>
				<label className="flex flex-col gap-2" htmlFor="decision-tie">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("decisionsTie")}
					</span>
					<select
						id="decision-tie"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={tieBreak}
						onChange={(event) => setTieBreak(event.target.value)}
					>
						<option value="">{t("decisionsTie")}</option>
						<option value="none">{t("decisionsTieNone")}</option>
						<option value="earlier_application">
							{t("decisionsTieEarlier")}
						</option>
					</select>
				</label>
				<label className="flex flex-col gap-2" htmlFor="decision-quota">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("decisionsQuota")}
					</span>
					<input
						id="decision-quota"
						inputMode="numeric"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={quota}
						onChange={(event) => setQuota(event.target.value)}
					/>
				</label>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="flex flex-col gap-2" htmlFor="decision-gender">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("decisionsGender")}
						</span>
						<input
							id="decision-gender"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={gender}
							maxLength={40}
							onChange={(event) => setGender(event.target.value)}
						/>
					</label>
					<label
						className="flex flex-col gap-2"
						htmlFor="decision-gender-count"
					>
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("decisionsGenderCount")}
						</span>
						<input
							id="decision-gender-count"
							inputMode="numeric"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={genderCount}
							onChange={(event) => setGenderCount(event.target.value)}
						/>
					</label>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="flex flex-col gap-2" htmlFor="decision-youth-age">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("decisionsYouthAge")}
						</span>
						<input
							id="decision-youth-age"
							inputMode="numeric"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={youthAge}
							onChange={(event) => setYouthAge(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="decision-youth-count">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("decisionsYouthCount")}
						</span>
						<input
							id="decision-youth-count"
							inputMode="numeric"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={youthCount}
							onChange={(event) => setYouthCount(event.target.value)}
						/>
					</label>
				</div>
				<label className="flex items-center gap-3 font-sans text-lg font-medium text-fg">
					<input
						type="checkbox"
						checked={onePerHousehold}
						onChange={(event) => setOnePerHousehold(event.target.checked)}
					/>
					{t("decisionsHousehold")}
				</label>
				<label className="flex items-center gap-3 font-sans text-lg font-medium text-fg">
					<input
						type="checkbox"
						checked={blockActiveGrant}
						onChange={(event) => setBlockActiveGrant(event.target.checked)}
					/>
					{t("decisionsActive")}
				</label>
				{error ? (
					<p className="font-sans text-sm font-medium text-danger" role="alert">
						{t(error)}
					</p>
				) : null}
				<Button
					type="submit"
					variant="sticker"
					className="w-fit"
					disabled={rank.isPending}
				>
					{t("decisionsRank")}
				</Button>
			</form>
			<ul>
				{detail.applicants.map((applicant) => (
					<li
						key={applicant.applicationId}
						className="border-t border-ink/15 py-4"
					>
						<Link
							to={`/decisions/${detail.id}/${applicant.applicationId}`}
							className="flex flex-col gap-2"
						>
							{applicant.rank !== null ? (
								<Badge variant="neutral">{String(applicant.rank)}</Badge>
							) : null}
							<p className="font-sans text-lg font-medium text-fg">
								{applicant.learnerName}
							</p>
							<p className="font-sans text-lg font-medium text-fg">
								{applicant.statement}
							</p>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}

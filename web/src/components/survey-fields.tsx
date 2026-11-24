import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export type SurveyDraft = {
	digitalConfidence: number;
	tasksDigital: number;
	income: number;
	services: string;
	jobsOrCustomers: number;
};

export function SurveyFields({
	saveLabel,
	pending,
	onSave,
}: {
	saveLabel: string;
	pending: boolean;
	onSave: (draft: SurveyDraft) => void;
}) {
	const { t } = useI18n();
	const [confidence, setConfidence] = useState("");
	const [tasks, setTasks] = useState("");
	const [income, setIncome] = useState("");
	const [services, setServices] = useState("");
	const [jobs, setJobs] = useState("");
	const ready =
		confidence !== "" &&
		tasks !== "" &&
		income !== "" &&
		services.trim() !== "" &&
		jobs !== "";

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		if (!ready) return;
		onSave({
			digitalConfidence: Number(confidence),
			tasksDigital: Number(tasks),
			income: Number(income),
			services,
			jobsOrCustomers: Number(jobs),
		});
	}

	return (
		<form className="flex flex-col gap-4" onSubmit={onSubmit}>
			<label className="flex flex-col gap-2">
				<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("surveysConfidence")}
				</span>
				<select
					className="rounded-md border border-ink/20 bg-paper px-3 py-3 font-sans text-lg text-fg"
					value={confidence}
					onChange={(event) => setConfidence(event.target.value)}
				>
					<option value="" />
					{["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map(
						(value) => (
							<option key={value} value={value}>
								{value}
							</option>
						),
					)}
				</select>
			</label>
			<label className="flex flex-col gap-2">
				<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("surveysTasks")}
				</span>
				<input
					className="rounded-md border border-ink/20 bg-paper px-3 py-3 font-sans text-lg text-fg"
					inputMode="numeric"
					value={tasks}
					onChange={(event) => setTasks(event.target.value)}
				/>
			</label>
			<label className="flex flex-col gap-2">
				<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("surveysIncome")}
				</span>
				<input
					className="rounded-md border border-ink/20 bg-paper px-3 py-3 font-sans text-lg text-fg"
					inputMode="numeric"
					value={income}
					onChange={(event) => setIncome(event.target.value)}
				/>
			</label>
			<label className="flex flex-col gap-2">
				<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("surveysServices")}
				</span>
				<textarea
					className="min-h-28 rounded-md border border-ink/20 bg-paper px-3 py-3 font-sans text-lg text-fg"
					value={services}
					onChange={(event) => setServices(event.target.value)}
				/>
			</label>
			<label className="flex flex-col gap-2">
				<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("surveysJobs")}
				</span>
				<input
					className="rounded-md border border-ink/20 bg-paper px-3 py-3 font-sans text-lg text-fg"
					inputMode="numeric"
					value={jobs}
					onChange={(event) => setJobs(event.target.value)}
				/>
			</label>
			{ready ? (
				<Button type="submit" className="w-fit" disabled={pending}>
					{saveLabel}
				</Button>
			) : null}
		</form>
	);
}

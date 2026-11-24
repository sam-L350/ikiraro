import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invalidateEngine, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export function TaskRehearsalFields({ taskId }: { taskId: string }) {
	const { t } = useI18n();
	const practice = useEngine("/tasks/:id/practice", { query: { id: taskId } });
	const group = useEngine("/tasks/:id/group", { query: { id: taskId } });
	const saveSample = useEngineMutation("/tasks/:id/practice/create");
	const saveRule = useEngineMutation("/tasks/:id/group/rule");
	const [titleEn, setTitleEn] = useState("");
	const [titleRw, setTitleRw] = useState("");
	const [bodyEn, setBodyEn] = useState("");
	const [bodyRw, setBodyRw] = useState("");
	const [ruleEn, setRuleEn] = useState("");
	const [ruleRw, setRuleRw] = useState("");
	const [filled, setFilled] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (filled || !practice.data || !group.data) return;
		setTitleEn(practice.data.sample?.titleEn ?? "");
		setTitleRw(practice.data.sample?.titleRw ?? "");
		setBodyEn(practice.data.sample?.bodyEn ?? "");
		setBodyRw(practice.data.sample?.bodyRw ?? "");
		setRuleEn(group.data.rule?.ruleEn ?? "");
		setRuleRw(group.data.rule?.ruleRw ?? "");
		setFilled(true);
	}, [filled, practice.data, group.data]);

	if (!practice.data?.canWrite && !group.data?.canWrite) return null;

	const sampleReady =
		titleEn.trim() !== "" &&
		titleRw.trim() !== "" &&
		bodyEn.trim() !== "" &&
		bodyRw.trim() !== "";
	const ruleReady = ruleEn.trim() !== "" && ruleRw.trim() !== "";

	async function onSample(event: FormEvent) {
		event.preventDefault();
		if (!sampleReady) return;
		setError(null);
		try {
			await saveSample.mutateAsync({
				body: {
					id: taskId,
					titleEn: titleEn.trim(),
					titleRw: titleRw.trim(),
					bodyEn: bodyEn.trim(),
					bodyRw: bodyRw.trim(),
				},
			});
			await invalidateEngine("/tasks/:id/practice");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	async function onRule(event: FormEvent) {
		event.preventDefault();
		if (!ruleReady) return;
		setError(null);
		try {
			await saveRule.mutateAsync({
				body: { id: taskId, ruleEn: ruleEn.trim(), ruleRw: ruleRw.trim() },
			});
			await invalidateEngine("/tasks/:id/group");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	return (
		<div className="mt-6 flex flex-col gap-6">
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void onSample(event)}
			>
				<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("taskPracticeSample")}
				</p>
				<label className="flex flex-col gap-2" htmlFor={`${taskId}-sample-en`}>
					<span className="font-meta text-xs uppercase text-fg-muted">
						{t("taskSampleTitleEn")}
					</span>
					<Input
						id={`${taskId}-sample-en`}
						value={titleEn}
						onChange={(event) => setTitleEn(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor={`${taskId}-sample-rw`}>
					<span className="font-meta text-xs uppercase text-fg-muted">
						{t("taskSampleTitleRw")}
					</span>
					<Input
						id={`${taskId}-sample-rw`}
						value={titleRw}
						onChange={(event) => setTitleRw(event.target.value)}
					/>
				</label>
				<label
					className="flex flex-col gap-2"
					htmlFor={`${taskId}-sample-body-en`}
				>
					<span className="font-meta text-xs uppercase text-fg-muted">
						{t("taskSampleBodyEn")}
					</span>
					<textarea
						id={`${taskId}-sample-body-en`}
						className="min-h-24 rounded-xl border border-line-strong bg-surface px-3 py-2 font-sans text-fg"
						value={bodyEn}
						onChange={(event) => setBodyEn(event.target.value)}
					/>
				</label>
				<label
					className="flex flex-col gap-2"
					htmlFor={`${taskId}-sample-body-rw`}
				>
					<span className="font-meta text-xs uppercase text-fg-muted">
						{t("taskSampleBodyRw")}
					</span>
					<textarea
						id={`${taskId}-sample-body-rw`}
						className="min-h-24 rounded-xl border border-line-strong bg-surface px-3 py-2 font-sans text-fg"
						value={bodyRw}
						onChange={(event) => setBodyRw(event.target.value)}
					/>
				</label>
				{sampleReady ? (
					<Button type="submit" variant="soft" className="w-fit">
						{t("taskSampleSave")}
					</Button>
				) : null}
			</form>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void onRule(event)}
			>
				<label className="flex flex-col gap-2" htmlFor={`${taskId}-rule-en`}>
					<span className="font-meta text-xs uppercase text-fg-muted">
						{t("taskRuleEn")}
					</span>
					<Input
						id={`${taskId}-rule-en`}
						value={ruleEn}
						onChange={(event) => setRuleEn(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor={`${taskId}-rule-rw`}>
					<span className="font-meta text-xs uppercase text-fg-muted">
						{t("taskRuleRw")}
					</span>
					<Input
						id={`${taskId}-rule-rw`}
						value={ruleRw}
						onChange={(event) => setRuleRw(event.target.value)}
					/>
				</label>
				{ruleReady ? (
					<Button type="submit" variant="soft" className="w-fit">
						{t("taskRuleSave")}
					</Button>
				) : null}
			</form>
			{error ? (
				<p className="font-sans text-lg text-destructive">{error}</p>
			) : null}
		</div>
	);
}

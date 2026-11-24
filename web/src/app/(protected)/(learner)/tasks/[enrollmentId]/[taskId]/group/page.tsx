import { type FormEvent, useState } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invalidateEngine, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

function textFor(locale: "rw" | "en", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
}

export default function TaskGroupPage() {
	const { taskId = "" } = useParams();
	const { locale, t } = useI18n();
	const group = useEngine(
		"/tasks/:id/group",
		{ query: { id: taskId } },
		{ enabled: taskId.length > 0 },
	);
	const start = useEngineMutation("/tasks/:id/group/create");
	const add = useEngineMutation("/tasks/:id/group/members");
	const credit = useEngineMutation("/tasks/:id/group/credit");
	const [name, setName] = useState("");
	const [kind, setKind] = useState("");
	const [picks, setPicks] = useState<Record<string, string>>({});
	const [notes, setNotes] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);

	if (group.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (group.error || !group.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = group.data;
	const ready =
		name.trim() !== "" && (kind === "cooperative" || kind === "family");
	const started = data.groups.some((item) => item.createdByMe);

	async function onStart(event: FormEvent) {
		event.preventDefault();
		if (!ready) return;
		setError(null);
		try {
			await start.mutateAsync({
				body: { id: taskId, kind, name: name.trim() },
			});
			setName("");
			setKind("");
			await invalidateEngine("/tasks/:id/group");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	async function onAdd(groupId: string) {
		const userId = Number(picks[groupId] ?? "");
		if (!Number.isInteger(userId) || userId <= 0) return;
		setError(null);
		try {
			await add.mutateAsync({ body: { id: taskId, groupId, userId } });
			setPicks((current) => ({ ...current, [groupId]: "" }));
			await invalidateEngine("/tasks/:id/group");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	async function onCredit(groupId: string) {
		const body = notes[groupId]?.trim() ?? "";
		if (!body) return;
		setError(null);
		try {
			await credit.mutateAsync({ body: { id: taskId, groupId, body } });
			setNotes((current) => ({ ...current, [groupId]: "" }));
			await invalidateEngine("/tasks/:id/group");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	return (
		<section className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("taskGroupTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("taskGroupSentence")}
				</p>
			</div>
			{!data.rule ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("taskGroupEmpty")}
				</p>
			) : (
				<p className="font-sans text-lg text-fg">
					{textFor(locale, data.rule.ruleRw, data.rule.ruleEn)}
				</p>
			)}
			{data.groups.map((item) => (
				<div key={item.id} className="flex flex-col gap-4">
					<h2 className="font-sans text-2xl font-semibold text-fg">
						{item.name}
					</h2>
					<p className="font-meta text-xs uppercase text-fg-muted">
						{item.kind === "family"
							? t("taskGroupFamily")
							: t("taskGroupCooperative")}
					</p>
					<table className="w-full border-collapse text-left">
						<thead>
							<tr className="font-meta text-xs uppercase text-fg-muted">
								<th className="border-b border-line py-2 font-semibold">
									{t("taskGroupPerson")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("taskGroupDid")}
								</th>
							</tr>
						</thead>
						<tbody>
							{item.members.map((member) => (
								<tr key={member.userId}>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{member.name}
									</td>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{member.did}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{item.createdByMe && data.classmates.length > 0 ? (
						<div className="flex flex-wrap items-end gap-3">
							<label className="flex flex-col gap-2" htmlFor={`add-${item.id}`}>
								<span className="font-meta text-xs uppercase text-fg-muted">
									{t("taskGroupPerson")}
								</span>
								<select
									id={`add-${item.id}`}
									className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
									value={picks[item.id] ?? ""}
									onChange={(event) =>
										setPicks((current) => ({
											...current,
											[item.id]: event.target.value,
										}))
									}
								>
									<option value="">{t("taskGroupPerson")}</option>
									{data.classmates.map((person) => (
										<option key={person.userId} value={person.userId}>
											{person.name}
										</option>
									))}
								</select>
							</label>
							{picks[item.id] ? (
								<Button
									type="button"
									variant="quiet"
									onClick={() => void onAdd(item.id)}
								>
									{t("taskGroupAdd")}
								</Button>
							) : null}
						</div>
					) : null}
					{item.members.some((member) => member.mine) ? (
						<div className="flex flex-col gap-2">
							<label className="flex flex-col gap-2" htmlFor={`did-${item.id}`}>
								<span className="font-meta text-xs uppercase text-fg-muted">
									{t("taskGroupCredit")}
								</span>
								<Input
									id={`did-${item.id}`}
									value={notes[item.id] ?? ""}
									onChange={(event) =>
										setNotes((current) => ({
											...current,
											[item.id]: event.target.value,
										}))
									}
								/>
							</label>
							{(notes[item.id]?.trim() ?? "") !== "" ? (
								<Button
									type="button"
									variant={started ? "ink" : "quiet"}
									className="w-fit"
									onClick={() => void onCredit(item.id)}
								>
									{t("taskGroupSaveCredit")}
								</Button>
							) : null}
						</div>
					) : null}
				</div>
			))}
			{data.rule && !started ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onStart(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="group-name">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("taskGroupName")}
						</span>
						<Input
							id="group-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="group-kind">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("taskGroupKind")}
						</span>
						<select
							id="group-kind"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={kind}
							onChange={(event) => setKind(event.target.value)}
						>
							<option value="">{t("taskGroupKind")}</option>
							<option value="cooperative">{t("taskGroupCooperative")}</option>
							<option value="family">{t("taskGroupFamily")}</option>
						</select>
					</label>
					{ready ? (
						<Button type="submit" variant="ink" className="w-fit">
							{t("taskGroupStart")}
						</Button>
					) : null}
				</form>
			) : null}
			{error ? (
				<p className="font-sans text-lg text-destructive">{error}</p>
			) : null}
		</section>
	);
}

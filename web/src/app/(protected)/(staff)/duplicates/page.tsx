import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Person = {
	id: number;
	name: string | null;
	dateOfBirth: string | null;
	centerName: string | null;
};

type Pair = {
	reason: "phone" | "identity";
	first: Person;
	second: Person;
};

type Waiting = {
	id: string;
	keepName: string | null;
	dropName: string | null;
	reason: string;
	mine: boolean;
	createdAt: string;
};

function personLine(person: Person): string {
	const parts = [person.name, person.dateOfBirth, person.centerName].filter(
		(part): part is string => Boolean(part),
	);
	return parts.join(" · ");
}

export default function DuplicatesPage() {
	const { t } = useI18n();
	const list = useEngine("/duplicates");
	const ask = useEngineMutation("/duplicates/merge");
	const decide = useEngineMutation("/duplicates/decide");
	const [selected, setSelected] = useState<Pair | null>(null);
	const [keepId, setKeepId] = useState<number | null>(null);
	const [reason, setReason] = useState("");
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("duplicatesDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="font-sans text-lg text-fg">{t("tryAgain")}</p>;
	}

	const pairs = list.data.pairs as Pair[];
	const waiting = list.data.waiting as Waiting[];
	const ready =
		selected !== null && keepId !== null && reason.trim().length > 0;
	const firstDecidable = waiting.find((row) => !row.mine)?.id ?? null;

	async function refresh() {
		setError(null);
		await invalidateEngine("/duplicates");
	}

	return (
		<section className="flex max-w-3xl flex-col gap-10">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("duplicatesTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("duplicatesSentence")}
				</p>
			</div>
			{pairs.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("duplicatesEmpty")}
				</p>
			) : (
				<table className="w-full border-collapse text-left">
					<thead>
						<tr className="border-b border-ink/15 font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							<th className="py-3 pr-4 font-medium">{t("duplicatesTitle")}</th>
							<th className="py-3 pr-4 font-medium">{t("duplicatesReason")}</th>
							<th className="py-3 font-medium">{t("duplicatesMerge")}</th>
						</tr>
					</thead>
					<tbody>
						{pairs.map((pair) => (
							<tr
								key={`${pair.first.id}-${pair.second.id}`}
								className="border-b border-ink/15"
							>
								<td className="py-4 pr-4 font-sans font-semibold text-fg">
									{personLine(pair.first)}
									<span className="mt-1 block font-medium">
										{personLine(pair.second)}
									</span>
								</td>
								<td className="py-4 pr-4">
									<Badge variant="neutral">
										{pair.reason === "phone"
											? t("duplicatesPhone")
											: t("duplicatesIdentity")}
									</Badge>
								</td>
								<td className="py-4">
									<Button
										type="button"
										variant="quiet"
										onClick={() => {
											setSelected(pair);
											setKeepId(null);
											setReason("");
											setError(null);
										}}
									>
										{t("duplicatesMerge")}
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			{selected ? (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						{[selected.first, selected.second].map((person) => (
							<Button
								key={person.id}
								type="button"
								variant="quiet"
								aria-pressed={keepId === person.id}
								onClick={() => setKeepId(person.id)}
							>
								{t("duplicatesKeep")}
								{person.name ? ` · ${person.name}` : ""}
							</Button>
						))}
					</div>
					<label className="flex flex-col gap-2" htmlFor="merge-reason">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("duplicatesReason")}
						</span>
						<Input
							id="merge-reason"
							value={reason}
							onChange={(event) => setReason(event.target.value)}
						/>
					</label>
					{ready && keepId !== null ? (
						<div>
							<Button
								type="button"
								variant="ink"
								disabled={ask.isPending}
								onClick={() => {
									const drop =
										keepId === selected.first.id
											? selected.second.id
											: selected.first.id;
									setError(null);
									void ask
										.mutateAsync({
											body: {
												keepUserId: keepId,
												dropUserId: drop,
												reason: reason.trim(),
											},
										})
										.then(async () => {
											setSelected(null);
											setKeepId(null);
											setReason("");
											await refresh();
										})
										.catch((caught: unknown) => {
											setError(
												isApiClientError(caught)
													? caught.message
													: t("tryAgain"),
											);
										});
								}}
							>
								{t("duplicatesAsk")}
							</Button>
						</div>
					) : null}
				</div>
			) : null}
			{waiting.length > 0 ? (
				<div className="flex flex-col gap-4">
					<h2 className="font-sans text-2xl font-semibold text-fg">
						{t("duplicatesWaiting")}
					</h2>
					<table className="w-full border-collapse text-left">
						<tbody>
							{waiting.map((row) => (
								<tr key={row.id} className="border-b border-ink/15">
									<td className="py-4 pr-4 font-sans font-semibold text-fg">
										{row.keepName} · {row.dropName}
										{row.mine ? (
											<span className="mt-1 block font-medium">
												{t("duplicatesMine")}
											</span>
										) : null}
									</td>
									<td className="py-4">
										{row.mine ? null : (
											<Button
												type="button"
												variant={
													!ready && row.id === firstDecidable ? "ink" : "quiet"
												}
												disabled={decide.isPending}
												onClick={() => {
													setError(null);
													void decide
														.mutateAsync({
															body: {
																requestId: row.id,
																decision: "approved",
																note: "",
															},
														})
														.then(() => refresh())
														.catch((caught: unknown) => {
															setError(
																isApiClientError(caught)
																	? caught.message
																	: t("tryAgain"),
															);
														});
												}}
											>
												{t("duplicatesApprove")}
											</Button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<label className="flex flex-col gap-2" htmlFor="merge-note">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("duplicatesNote")}
						</span>
						<Input
							id="merge-note"
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
					</label>
					{note.trim() && firstDecidable ? (
						<div>
							<Button
								type="button"
								variant="quiet"
								disabled={decide.isPending}
								onClick={() => {
									setError(null);
									void decide
										.mutateAsync({
											body: {
												requestId: firstDecidable,
												decision: "declined",
												note: note.trim(),
											},
										})
										.then(async () => {
											setNote("");
											await refresh();
										})
										.catch((caught: unknown) => {
											setError(
												isApiClientError(caught)
													? caught.message
													: t("tryAgain"),
											);
										});
								}}
							>
								{t("duplicatesDecline")}
							</Button>
						</div>
					) : null}
				</div>
			) : null}
			{error ? (
				<p className="font-sans text-sm font-medium text-danger" role="alert">
					{error}
				</p>
			) : null}
		</section>
	);
}

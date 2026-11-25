import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type ConfigSetting = {
	key: string;
	version: number;
	value: number | string;
	editable: boolean;
};

type KnownSetting =
	| "session.shared_idle_ms"
	| "sms.daily_cap"
	| "media.max_bytes"
	| "review.sla_ms"
	| "review.second_every"
	| "review.second_new_every"
	| "review.new_trainer_approvals"
	| "points.fast_days"
	| "points.fast_amount"
	| "review.single_reviewer_min";

const GROUPS: { title: MessageKey; keys: readonly KnownSetting[] }[] = [
	{ title: "settingGroupSession", keys: ["session.shared_idle_ms"] },
	{ title: "settingGroupMessages", keys: ["sms.daily_cap"] },
	{ title: "settingGroupFiles", keys: ["media.max_bytes"] },
	{
		title: "settingGroupReview",
		keys: [
			"review.sla_ms",
			"review.second_every",
			"review.second_new_every",
			"review.new_trainer_approvals",
			"review.single_reviewer_min",
		],
	},
	{
		title: "settingGroupPoints",
		keys: ["points.fast_days", "points.fast_amount"],
	},
];

function isKnownSetting(key: string): key is KnownSetting {
	switch (key) {
		case "session.shared_idle_ms":
		case "sms.daily_cap":
		case "media.max_bytes":
		case "review.sla_ms":
		case "review.second_every":
		case "review.second_new_every":
		case "review.new_trainer_approvals":
		case "points.fast_days":
		case "points.fast_amount":
		case "review.single_reviewer_min":
			return true;
		default:
			return false;
	}
}

function settingCopy(key: KnownSetting): {
	title: MessageKey;
	hint: MessageKey;
} {
	switch (key) {
		case "session.shared_idle_ms":
			return { title: "settingIdleTitle", hint: "settingIdleHint" };
		case "sms.daily_cap":
			return { title: "settingSmsTitle", hint: "settingSmsHint" };
		case "media.max_bytes":
			return { title: "settingMediaTitle", hint: "settingMediaHint" };
		case "review.sla_ms":
			return { title: "settingSlaTitle", hint: "settingSlaHint" };
		case "review.second_every":
			return {
				title: "settingSecondEveryTitle",
				hint: "settingSecondEveryHint",
			};
		case "review.second_new_every":
			return { title: "settingSecondNewTitle", hint: "settingSecondNewHint" };
		case "review.new_trainer_approvals":
			return { title: "settingNewTrainerTitle", hint: "settingNewTrainerHint" };
		case "points.fast_days":
			return { title: "settingFastDaysTitle", hint: "settingFastDaysHint" };
		case "points.fast_amount":
			return { title: "settingFastAmountTitle", hint: "settingFastAmountHint" };
		case "review.single_reviewer_min":
			return { title: "settingSingleTitle", hint: "settingSingleHint" };
		default: {
			const unreachable: never = key;
			return unreachable;
		}
	}
}

function settingReading(
	key: string,
	value: number | string,
	t: (key: MessageKey, vars?: Record<string, string>) => string,
): string | null {
	if (typeof value !== "number" || value === 0) return null;
	if (key.endsWith("_ms") && value % 3_600_000 === 0) {
		return t("settingHours", { count: String(value / 3_600_000) });
	}
	if (key.endsWith("_ms") && value % 60_000 === 0) {
		return t("settingMinutes", { count: String(value / 60_000) });
	}
	if (key.endsWith("_bytes") && value % (1024 * 1024) === 0) {
		return t("settingMegabytes", { count: String(value / (1024 * 1024)) });
	}
	return null;
}

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	if (error.status === 404) return "settingsInvalid";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "value":
		case "key":
			return "settingsInvalid";
		default:
			return "tryAgain";
	}
}

export default function SettingsPage() {
	const { t } = useI18n();
	const online = useOnline();
	const list = useEngine("/config");
	const save = useEngineMutation("/config/update");
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [message, setMessage] = useState<MessageKey | null>(null);

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const rows = list.data as ConfigSetting[];
	const editable = rows.some((row) => row.editable);
	const used = new Set<string>();
	const groups = GROUPS.flatMap((group) => {
		const items = group.keys.flatMap((key) => {
			const row = rows.find((item) => item.key === key);
			if (!row) return [];
			used.add(key);
			return [row];
		});
		return items.length === 0 ? [] : [{ title: group.title, items }];
	});
	const other = rows.filter((row) => !used.has(row.key));
	if (other.length > 0) {
		groups.push({ title: "settingOther", items: other });
	}

	async function onSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!online) {
			setMessage("settingsOffline");
			return;
		}
		setMessage(null);
		const changed = rows.filter((row) => {
			if (!row.editable) return false;
			const draft = drafts[row.key];
			if (draft === undefined) return false;
			return draft !== String(row.value);
		});
		if (changed.length === 0) {
			setMessage("settingsUnchanged");
			return;
		}
		try {
			for (const row of changed) {
				const draft = drafts[row.key] ?? "";
				const parsed = Number(draft);
				if (!Number.isInteger(parsed)) {
					setMessage("settingsInvalid");
					return;
				}
				await save.mutateAsync({ body: { key: row.key, value: parsed } });
			}
			setDrafts({});
			setMessage("settingsSaved");
			await list.invalidate();
		} catch (caught) {
			setMessage(reasonKey(caught));
		}
	}

	return (
		<form className="mx-auto flex max-w-3xl flex-col gap-8" onSubmit={onSave}>
			<div className="flex flex-col gap-3">
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("settingsTitle")}
				</h1>
				<p className="max-w-xl font-sans text-lg font-medium text-fg">
					{t("settingsLead")}
				</p>
			</div>
			{!online ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("settingsOffline")}
				</p>
			) : null}
			{rows.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("auditEmpty")}
				</p>
			) : (
				groups.map((group) => (
					<section
						key={group.title}
						className="rounded-[20px] bg-surface p-5 sm:p-6"
					>
						<h2 className="font-sans text-2xl font-semibold text-fg">
							{t(group.title)}
						</h2>
						<ul className="mt-2 flex flex-col">
							{group.items.map((row) => {
								const copy = isKnownSetting(row.key)
									? settingCopy(row.key)
									: null;
								const reading = settingReading(row.key, row.value, t);
								return (
									<li
										key={row.key}
										className="grid gap-3 border-t border-line py-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center"
									>
										<div>
											<label
												className="font-sans text-lg font-semibold text-fg"
												htmlFor={`setting-${row.key}`}
											>
												{copy ? t(copy.title) : row.key}
											</label>
											{copy ? (
												<p className="mt-1 font-sans text-sm font-medium text-fg">
													{t(copy.hint)}
												</p>
											) : null}
											<p className="mt-1 font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
												{t("settingsVersion", { count: String(row.version) })}
												{reading ? ` · ${reading}` : ""}
											</p>
										</div>
										{row.editable ? (
											<Input
												id={`setting-${row.key}`}
												inputMode="numeric"
												value={drafts[row.key] ?? String(row.value)}
												onChange={(event) =>
													setDrafts((current) => ({
														...current,
														[row.key]: event.target.value,
													}))
												}
											/>
										) : (
											<p
												id={`setting-${row.key}`}
												className="font-sans text-lg font-semibold text-fg"
											>
												{String(row.value)}
											</p>
										)}
									</li>
								);
							})}
						</ul>
					</section>
				))
			)}
			{message ? (
				<p className="font-sans text-lg text-fg">{t(message)}</p>
			) : null}
			{editable ? (
				<Button
					type="submit"
					className="w-fit"
					disabled={!online || save.isPending}
				>
					{t("settingsSave")}
				</Button>
			) : null}
		</form>
	);
}

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { RecordTable } from "@/components/ui/record-table";
import { callEngine, isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import { useOnline } from "@/lib/offline/use-online";

type AuditRow = {
	id: string;
	action: string;
	actorId: number | null;
	actorName: string | null;
	targetType: string | null;
	targetId: string | null;
	createdAt: string;
};

function whenLabel(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

export default function AuditPage() {
	const { t } = useI18n();
	const online = useOnline();
	const [action, setAction] = useState("");
	const [targetType, setTargetType] = useState("");
	const [filter, setFilter] = useState({ action: "", targetType: "" });
	const page = useEngine("/audit", {
		query: {
			action: filter.action || undefined,
			targetType: filter.targetType || undefined,
		},
	});

	function onSearch(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFilter({ action: action.trim(), targetType: targetType.trim() });
	}

	async function onDownload() {
		const result = await callEngine("/audit/export", {
			query: {
				action: filter.action || undefined,
				targetType: filter.targetType || undefined,
			},
		});
		const blob = new Blob([result.csv], { type: "text/csv" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "ikiraro-audit.csv";
		link.click();
		URL.revokeObjectURL(url);
		await page.invalidate();
	}

	if (page.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(page.error) && page.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (page.error || !page.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const rows = page.data as AuditRow[];

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8">
			<div className="flex flex-col gap-3">
				<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
					{t("auditTitle")}
				</h1>
				<p className="text-lg text-fg">{t("auditLead")}</p>
				{online ? null : (
					<p className="text-lg text-fg">{t("offlineDecision")}</p>
				)}
			</div>
			<form className="grid gap-4 sm:grid-cols-2" onSubmit={onSearch}>
				<label className="flex flex-col gap-2" htmlFor="audit-action">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("auditAction")}
					</span>
					<Input
						id="audit-action"
						value={action}
						disabled={!online}
						onChange={(event) => setAction(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="audit-target">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("auditTarget")}
					</span>
					<Input
						id="audit-target"
						value={targetType}
						disabled={!online}
						onChange={(event) => setTargetType(event.target.value)}
					/>
				</label>
				<div className="flex flex-wrap items-center gap-4">
					<Button type="submit" variant="sticker" disabled={!online}>
						{t("auditSearch")}
					</Button>
					<Button
						type="button"
						variant="quiet"
						disabled={!online}
						onClick={() => void onDownload()}
					>
						{t("auditDownload")}
					</Button>
				</div>
			</form>
			{rows.length === 0 ? (
				<EmptyState sentence={t("auditEmpty")} />
			) : (
				<RecordTable
					caption={t("auditTitle")}
					columns={[
						t("sessionWhen"),
						t("auditAction"),
						t("nameLabel"),
						t("auditTarget"),
					]}
					rows={rows.map((row) => ({
						key: row.id,
						cells: [
							whenLabel(row.createdAt),
							row.action,
							row.actorName ?? "",
							row.targetType ?? "",
						],
					}))}
				/>
			)}
		</div>
	);
}

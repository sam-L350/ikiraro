import { type FormEvent, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTabs } from "@/components/ui/page-tabs";
import { RecordTable } from "@/components/ui/record-table";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type Scope = "center" | "district" | "global" | "self";

type Change = { key: string; email: string; role: string; scopeId: string };

const ROLES: { code: string; label: MessageKey; scope: Scope }[] = [
	{ code: "trainer", label: "approvalsRoleTrainer", scope: "center" },
	{ code: "center_manager", label: "approvalsRoleManager", scope: "center" },
	{
		code: "district_coordinator",
		label: "approvalsRoleCoordinator",
		scope: "district",
	},
	{ code: "content_author", label: "approvalsRoleAuthor", scope: "global" },
	{ code: "content_reviewer", label: "approvalsRoleReviewer", scope: "global" },
	{ code: "hardware_officer", label: "approvalsRoleHardware", scope: "global" },
	{
		code: "committee_member",
		label: "approvalsRoleCommittee",
		scope: "global",
	},
	{ code: "auditor", label: "approvalsRoleAuditor", scope: "global" },
	{ code: "platform_admin", label: "approvalsRoleAdmin", scope: "global" },
	{ code: "mentor", label: "approvalsRoleMentor", scope: "self" },
	{ code: "public_verifier", label: "approvalsRoleVerifier", scope: "self" },
];

function blank(): Change {
	return { key: crypto.randomUUID(), email: "", role: "", scopeId: "" };
}

function scopeOf(role: string): Scope | "" {
	return ROLES.find((item) => item.code === role)?.scope ?? "";
}

export default function ApprovalsPage() {
	const { t } = useI18n();
	const list = useEngine("/admin-approvals");
	const centers = useEngine("/centers");
	const ask = useEngineMutation("/admin-approvals/create");
	const approve = useEngineMutation("/admin-approvals/:id/approve");
	const decline = useEngineMutation("/admin-approvals/:id/decline");
	const [reason, setReason] = useState("");
	const [rows, setRows] = useState<Change[]>([blank(), blank()]);
	const [notes, setNotes] = useState<Record<string, string>>({});
	const [formError, setFormError] = useState<string | null>(null);
	const [panel, setPanel] = useState<"list" | "add">("list");

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("approvalsDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const pending = list.data.filter((item) => item.status === "pending");
	const ready =
		reason.trim() !== "" &&
		rows.every((row) => {
			const scope = scopeOf(row.role);
			if (row.email.trim() === "" || scope === "") return false;
			return (
				scope === "global" || scope === "self" || row.scopeId.trim() !== ""
			);
		});

	async function onAsk(event: FormEvent) {
		event.preventDefault();
		if (!ready) return;
		setFormError(null);
		try {
			await ask.mutateAsync({
				body: {
					reason: reason.trim(),
					changes: rows.map((row) => {
						const scope = scopeOf(row.role);
						return {
							email: row.email.trim(),
							role: row.role,
							scopeType: scope,
							scopeId: scope === "global" ? "global" : row.scopeId.trim(),
						};
					}),
				},
			});
			setReason("");
			setRows([blank(), blank()]);
			await invalidateEngine("/admin-approvals");
		} catch (error) {
			setFormError(error instanceof Error ? error.message : t("tryAgain"));
		}
	}

	async function onApprove(id: string) {
		setFormError(null);
		try {
			await approve.mutateAsync({ body: { id } });
			await invalidateEngine("/admin-approvals");
		} catch (error) {
			setFormError(error instanceof Error ? error.message : t("tryAgain"));
		}
	}

	async function onDecline(id: string) {
		const note = notes[id]?.trim() ?? "";
		if (!note) return;
		setFormError(null);
		try {
			await decline.mutateAsync({ body: { id, note } });
			await invalidateEngine("/admin-approvals");
		} catch (error) {
			setFormError(error instanceof Error ? error.message : t("tryAgain"));
		}
	}

	let approveShown = false;

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("approvalsTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("approvalsSentence")}
				</p>
			</div>
			<PageTabs
				label={t("approvalsTitle")}
				value={panel}
				onChange={setPanel}
				tabs={[
					{ value: "list", label: t("listTab") },
					{ value: "add", label: t("addTab") },
				]}
			/>
			{panel === "list" ? (
				pending.length === 0 ? (
					<EmptyState sentence={t("approvalsEmpty")} />
				) : (
					<RecordTable
						caption={t("approvalsTitle")}
						columns={[t("nameLabel"), t("status"), t("openRow")]}
						rows={pending.map((item) => {
							const ink = !item.mine && !approveShown;
							if (ink) approveShown = true;
							return {
								key: item.id,
								cells: [
									<div key="who">
										<p>{item.reason}</p>
										<p>
											{item.changes
												.map((change) => `${change.name} · ${change.role}`)
												.join(", ")}
										</p>
									</div>,
									<Badge key="status" variant="pending">
										{item.mine ? t("approvalsWaiting") : item.requestedByName}
									</Badge>,
									item.mine ? null : (
										<div key="action" className="flex flex-col gap-3">
											<Button
												type="button"
												variant={ink ? "ink" : "quiet"}
												className="w-fit"
												onClick={() => void onApprove(item.id)}
											>
												{t("approvalsApprove")}
											</Button>
											<label
												className="flex flex-col gap-2"
												htmlFor={`note-${item.id}`}
											>
												<span className="font-meta text-xs uppercase text-fg-muted">
													{t("approvalsNote")}
												</span>
												<textarea
													id={`note-${item.id}`}
													className="min-h-20 rounded-md border border-line bg-card px-3 py-2 font-sans text-lg text-fg"
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
													variant="quiet"
													className="w-fit"
													onClick={() => void onDecline(item.id)}
												>
													{t("approvalsDecline")}
												</Button>
											) : null}
										</div>
									),
								],
							};
						})}
					/>
				)
			) : null}
			{panel === "add" ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onAsk(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="approval-reason">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("approvalsReason")}
						</span>
						<textarea
							id="approval-reason"
							className="min-h-20 rounded-md border border-line bg-card px-3 py-2 font-sans text-lg text-fg"
							value={reason}
							onChange={(event) => setReason(event.target.value)}
						/>
					</label>
					{rows.map((row, index) => {
						const scope = scopeOf(row.role);
						return (
							<div key={row.key} className="flex flex-col gap-3">
								<label
									className="flex flex-col gap-2"
									htmlFor={`email-${index}`}
								>
									<span className="font-meta text-xs uppercase text-fg-muted">
										{t("approvalsEmail")}
									</span>
									<input
										id={`email-${index}`}
										className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
										value={row.email}
										onChange={(event) =>
											setRows((current) =>
												current.map((item, itemIndex) =>
													itemIndex === index
														? { ...item, email: event.target.value }
														: item,
												),
											)
										}
									/>
								</label>
								<label
									className="flex flex-col gap-2"
									htmlFor={`role-${index}`}
								>
									<span className="font-meta text-xs uppercase text-fg-muted">
										{t("approvalsRole")}
									</span>
									<select
										id={`role-${index}`}
										className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
										value={row.role}
										onChange={(event) =>
											setRows((current) =>
												current.map((item, itemIndex) =>
													itemIndex === index
														? { ...item, role: event.target.value, scopeId: "" }
														: item,
												),
											)
										}
									>
										<option value="">{t("approvalsRole")}</option>
										{ROLES.map((role) => (
											<option key={role.code} value={role.code}>
												{t(role.label)}
											</option>
										))}
									</select>
								</label>
								{scope === "center" ? (
									<label
										className="flex flex-col gap-2"
										htmlFor={`place-${index}`}
									>
										<span className="font-meta text-xs uppercase text-fg-muted">
											{t("approvalsPlace")}
										</span>
										<select
											id={`place-${index}`}
											className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
											value={row.scopeId}
											onChange={(event) =>
												setRows((current) =>
													current.map((item, itemIndex) =>
														itemIndex === index
															? { ...item, scopeId: event.target.value }
															: item,
													),
												)
											}
										>
											<option value="">{t("approvalsPlace")}</option>
											{(centers.data?.centers ?? []).map((center) => (
												<option key={center.id} value={center.id}>
													{center.name}
												</option>
											))}
										</select>
									</label>
								) : null}
								{scope === "district" ? (
									<label
										className="flex flex-col gap-2"
										htmlFor={`place-${index}`}
									>
										<span className="font-meta text-xs uppercase text-fg-muted">
											{t("approvalsPlace")}
										</span>
										<input
											id={`place-${index}`}
											className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
											value={row.scopeId}
											onChange={(event) =>
												setRows((current) =>
													current.map((item, itemIndex) =>
														itemIndex === index
															? { ...item, scopeId: event.target.value }
															: item,
													),
												)
											}
										/>
									</label>
								) : null}
							</div>
						);
					})}
					{formError ? (
						<p className="font-sans text-lg text-destructive">{formError}</p>
					) : null}
					{ready ? (
						<Button type="submit" variant="ink" className="w-fit">
							{t("approvalsAsk")}
						</Button>
					) : null}
				</form>
			) : null}
		</section>
	);
}

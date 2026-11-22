import { type FormEvent, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type StaffTab = "new" | "people";
type StaffStatus = "all" | "active" | "off" | "temporary";

function matchesStatus(
	person: { deactivated: boolean; mustChangePassword: boolean },
	status: StaffStatus,
): boolean {
	switch (status) {
		case "all":
			return true;
		case "active":
			return !person.deactivated;
		case "off":
			return person.deactivated;
		case "temporary":
			return !person.deactivated && person.mustChangePassword;
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "role_ceiling":
			return "roleCeiling";
		case "short_password":
			return "shortPassword";
		case "email_taken":
			return "emailTaken";
		case "email_required":
			return "tryAgain";
		case "name_required":
			return "tryAgain";
		default:
			return "tryAgain";
	}
}

export default function AddStaffPage() {
	const { t } = useI18n();
	const { user } = useAuth();
	const context = useEngine("/staff/context");
	const list = useEngine("/staff");
	const create = useEngineMutation("/staff/create");
	const deactivate = useEngineMutation("/staff/:id/deactivation");
	const reset = useEngineMutation("/staff/:id/password");
	const [tab, setTab] = useState<StaffTab>("new");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [role, setRole] = useState("");
	const [scopeId, setScopeId] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);
	const [confirmId, setConfirmId] = useState<number | null>(null);
	const [resetId, setResetId] = useState<number | null>(null);
	const [resetPassword, setResetPassword] = useState("");
	const [search, setSearch] = useState("");
	const [roleFilter, setRoleFilter] = useState("all");
	const [statusFilter, setStatusFilter] = useState<StaffStatus>("all");

	const mode = context.data?.mode ?? "none";
	const roles = context.data?.roles ?? [];
	const selected = roles.find((item) => item.code === role) ?? roles[0];
	const centers = context.data?.centers ?? [];
	const scopeType = selected?.scopeType ?? "center";
	const lockedScope =
		mode === "center"
			? (centers[0] ?? "")
			: scopeType === "global"
				? "global"
				: scopeType === "self"
					? "self"
					: scopeId;

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selected) return;
		setError(null);
		try {
			await create.mutateAsync({
				body: {
					name,
					email,
					password,
					role: selected.code,
					scopeType: selected.scopeType,
					scopeId: lockedScope,
				},
			});
			setName("");
			setEmail("");
			setPassword("");
			setTab("people");
			await list.invalidate();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	if (context.isLoading) return null;
	if (mode === "none") {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("cannotAddStaff")}
			</p>
		);
	}

	const people = [...(list.data?.staff ?? [])].sort((a, b) => {
		if (a.deactivated !== b.deactivated) return a.deactivated ? 1 : -1;
		return (a.name ?? a.email).localeCompare(b.name ?? b.email);
	});
	const roleOptions = [
		...new Map(
			people.map((person) => [person.role, person.roleName]),
		).entries(),
	];
	const needle = search.trim().toLowerCase();
	const visible = people.filter((person) => {
		if (!matchesStatus(person, statusFilter)) return false;
		if (roleFilter !== "all" && person.role !== roleFilter) return false;
		if (!needle) return true;
		const haystack = [
			person.name,
			person.email,
			person.roleName,
			person.scopeId,
		]
			.filter((part) => part)
			.join(" ")
			.toLowerCase();
		return haystack.includes(needle);
	});
	const statusFilters = [
		["all", "staffFilterAll"],
		["active", "staffFilterActive"],
		["off", "staffOff"],
		["temporary", "temporaryPassword"],
	] as const;

	return (
		<section className="max-w-3xl">
			<div
				role="tablist"
				aria-label={t("staffAccounts")}
				className="flex gap-2"
			>
				{(
					[
						["new", "staffTabNew"],
						["people", "staffTabPeople"],
					] as const
				).map(([value, label]) => (
					<button
						key={value}
						type="button"
						role="tab"
						aria-selected={tab === value}
						className={cn(
							"inline-flex min-h-11 items-center rounded-full px-4 font-sans text-sm font-semibold",
							tab === value ? "bg-ink text-ink-fg" : "text-fg hover:bg-surface",
						)}
						onClick={() => setTab(value)}
					>
						{t(label)}
					</button>
				))}
			</div>
			{tab === "new" ? (
				<div className="mt-10" role="tabpanel">
					<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
						{t("addStaffTitle")}
					</h1>
					<p className="mt-4 font-sans text-lg font-medium text-fg">
						{t("addStaffSentence")}
					</p>
					<form className="mt-8 flex flex-col gap-4" onSubmit={onSubmit}>
						<label className="flex flex-col gap-2" htmlFor="staff-name">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("nameLabel")}
							</span>
							<Input
								id="staff-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								required
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="staff-email">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("emailLabel")}
							</span>
							<Input
								id="staff-email"
								type="email"
								autoComplete="off"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								required
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="staff-password">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("temporaryPassword")}
							</span>
							<Input
								id="staff-password"
								type="password"
								autoComplete="new-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								required
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="staff-role">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("staffRole")}
							</span>
							<select
								id="staff-role"
								className="h-11 rounded-xl border border-ink/15 bg-canvas px-3 font-sans text-fg"
								value={selected?.code ?? ""}
								onChange={(event) => setRole(event.target.value)}
							>
								{roles.map((item) => (
									<option key={item.code} value={item.code}>
										{item.name}
									</option>
								))}
							</select>
						</label>
						{mode === "admin" &&
						(scopeType === "center" || scopeType === "district") ? (
							<label className="flex flex-col gap-2" htmlFor="staff-scope">
								<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
									{t("staffScope")}
								</span>
								<Input
									id="staff-scope"
									value={scopeId}
									onChange={(event) => setScopeId(event.target.value)}
									required
								/>
							</label>
						) : (
							<p className="font-sans text-sm font-medium text-fg">
								{t("staffScope")}: {lockedScope}
							</p>
						)}
						{error ? (
							<p
								className="font-sans text-sm font-medium text-danger"
								role="alert"
							>
								{t(error)}
							</p>
						) : null}
						<div>
							<Button
								type="submit"
								variant="sticker"
								disabled={create.isPending}
							>
								{t("createStaff")}
							</Button>
						</div>
					</form>
				</div>
			) : (
				<div className="mt-10" role="tabpanel">
					<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
						{t("staffTabPeople")}
					</h1>
					{people.length === 0 ? (
						<p className="mt-6 font-sans text-lg font-medium text-fg">
							{t("staffEmpty")}
						</p>
					) : (
						<>
							<div className="mt-8 flex flex-col gap-4">
								<label className="flex flex-col gap-2" htmlFor="staff-search">
									<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
										{t("staffSearch")}
									</span>
									<Input
										id="staff-search"
										value={search}
										onChange={(event) => setSearch(event.target.value)}
									/>
								</label>
								<div className="flex flex-col gap-2">
									<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
										{t("status")}
									</span>
									<div className="flex flex-wrap gap-2">
										{statusFilters.map(([value, label]) => (
											<button
												key={value}
												type="button"
												aria-pressed={statusFilter === value}
												className={cn(
													"inline-flex min-h-11 items-center rounded-full px-4 font-sans text-sm font-semibold",
													statusFilter === value
														? "bg-ink text-ink-fg"
														: "bg-surface text-fg",
												)}
												onClick={() => setStatusFilter(value)}
											>
												{t(label)}
											</button>
										))}
									</div>
								</div>
								<label
									className="flex flex-col gap-2"
									htmlFor="staff-role-filter"
								>
									<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
										{t("staffRole")}
									</span>
									<select
										id="staff-role-filter"
										className="h-11 rounded-xl border border-ink/15 bg-canvas px-3 font-sans text-fg"
										value={roleFilter}
										onChange={(event) => setRoleFilter(event.target.value)}
									>
										<option value="all">{t("staffAllRoles")}</option>
										{roleOptions.map(([code, label]) => (
											<option key={code} value={code}>
												{label}
											</option>
										))}
									</select>
								</label>
								<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
									{t("staffShown", { count: String(visible.length) })}
								</p>
							</div>
							{visible.length === 0 ? (
								<p className="mt-6 font-sans text-lg font-medium text-fg">
									{t("staffNoMatch")}
								</p>
							) : (
								<ul className="mt-4 flex flex-col">
									{visible.map((person) => {
										const own = person.id === user?.id;
										const closed = person.deactivated;
										const confirming = confirmId === person.id;
										const resetting = resetId === person.id;
										const place =
											person.scopeId &&
											person.scopeId !== "global" &&
											person.scopeId !== "self"
												? person.scopeId
												: null;
										return (
											<li
												key={`${person.id}-${person.role}`}
												className="grid gap-3 border-t border-ink/15 py-5 sm:grid-cols-[1fr_auto] sm:items-start"
											>
												<div className="min-w-0">
													<p className="font-sans text-lg font-semibold text-fg">
														{person.name ?? person.email}
													</p>
													<p className="mt-1 font-sans text-sm text-fg-muted">
														{person.email}
													</p>
													<div className="mt-3 flex flex-wrap gap-2">
														<Badge variant="ink">{person.roleName}</Badge>
														{place ? (
															<Badge variant="neutral">{place}</Badge>
														) : null}
														{closed ? (
															<Badge variant="danger">{t("staffOff")}</Badge>
														) : null}
														{!closed && person.mustChangePassword ? (
															<Badge variant="pending">
																{t("temporaryPassword")}
															</Badge>
														) : null}
													</div>
												</div>
												{closed || own ? null : (
													<div className="flex flex-row flex-wrap items-center gap-2 sm:justify-end">
														{confirming ? (
															<div className="flex flex-col items-start gap-3 sm:items-end">
																<p className="font-sans text-sm font-medium text-fg">
																	{t("deactivateStaffBody")}
																</p>
																<Button
																	type="button"
																	variant="danger"
																	disabled={deactivate.isPending}
																	onClick={() => {
																		void deactivate
																			.mutateAsync({ body: { id: person.id } })
																			.then(() => {
																				setConfirmId(null);
																				return list.invalidate();
																			});
																	}}
																>
																	{t("deactivateAction")}
																</Button>
															</div>
														) : (
															<Button
																type="button"
																variant="soft"
																className="w-fit bg-danger-soft text-danger hover:bg-danger-soft"
																onClick={() => {
																	setConfirmId(person.id);
																	setResetId(null);
																}}
															>
																{t("deactivateAction")}
															</Button>
														)}
														{resetting ? (
															<form
																className="flex flex-col items-start gap-3 sm:items-end"
																onSubmit={(event) => {
																	event.preventDefault();
																	void reset
																		.mutateAsync({
																			body: {
																				id: person.id,
																				password: resetPassword,
																			},
																		})
																		.then(() => {
																			setResetId(null);
																			setResetPassword("");
																			return list.invalidate();
																		});
																}}
															>
																<Input
																	type="password"
																	autoComplete="new-password"
																	value={resetPassword}
																	onChange={(event) =>
																		setResetPassword(event.target.value)
																	}
																	required
																/>
																<Button
																	type="submit"
																	variant="soft"
																	className="w-fit"
																	disabled={reset.isPending}
																>
																	{t("resetStaffPassword")}
																</Button>
															</form>
														) : (
															<Button
																type="button"
																variant="soft"
																className="w-fit"
																onClick={() => {
																	setResetId(person.id);
																	setConfirmId(null);
																	setResetPassword("");
																}}
															>
																{t("staffResetAction")}
															</Button>
														)}
													</div>
												)}
											</li>
										);
									})}
								</ul>
							)}
						</>
					)}
				</div>
			)}
		</section>
	);
}

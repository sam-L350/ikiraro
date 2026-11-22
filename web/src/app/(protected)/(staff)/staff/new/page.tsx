import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

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
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [role, setRole] = useState("");
	const [scopeId, setScopeId] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);
	const [confirmId, setConfirmId] = useState<number | null>(null);
	const [resetId, setResetId] = useState<number | null>(null);
	const [resetPassword, setResetPassword] = useState("");

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

	return (
		<section className="max-w-3xl">
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
					<p className="font-sans text-sm font-medium text-danger" role="alert">
						{t(error)}
					</p>
				) : null}
				<div>
					<Button type="submit" variant="sticker" disabled={create.isPending}>
						{t("createStaff")}
					</Button>
				</div>
			</form>
			<ul className="mt-12 flex flex-col">
				{list.data?.staff.map((person) => (
					<li
						key={`${person.id}-${person.role}`}
						className="flex flex-col gap-3 border-t border-ink/15 py-4"
					>
						<span className="font-sans font-semibold text-fg">
							{person.name ?? person.email} · {person.roleName}
						</span>
						{person.deactivated || person.id === user?.id ? null : confirmId ===
							person.id ? (
							<div className="flex flex-col items-start gap-3">
								<p className="font-sans text-lg font-medium text-fg">
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
								variant="quiet"
								className="px-0"
								onClick={() => setConfirmId(person.id)}
							>
								{t("deactivateTitle")}
							</Button>
						)}
						{person.deactivated || person.id === user?.id ? null : resetId ===
							person.id ? (
							<form
								className="flex flex-col items-start gap-3"
								onSubmit={(event) => {
									event.preventDefault();
									void reset
										.mutateAsync({
											body: { id: person.id, password: resetPassword },
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
									onChange={(event) => setResetPassword(event.target.value)}
									required
								/>
								<Button
									type="submit"
									variant="quiet"
									disabled={reset.isPending}
								>
									{t("resetStaffPassword")}
								</Button>
							</form>
						) : (
							<Button
								type="button"
								variant="quiet"
								className="px-0"
								onClick={() => setResetId(person.id)}
							>
								{t("resetStaffPassword")}
							</Button>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}

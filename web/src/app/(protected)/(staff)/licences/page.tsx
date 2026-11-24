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

type Holder = { grantId: string; name: string };
type Learner = { id: number; name: string };
type Licence = {
	id: string;
	name: string;
	seats: number;
	seatsUsed: number;
	expiresOn: string;
	holders: Holder[];
};
type LicenceList = { licences: Licence[]; learners: Learner[] };

function wholeSeats(value: string): number | null {
	if (!/^[1-9]\d*$/.test(value.trim())) return null;
	const seats = Number(value);
	return seats <= 10000 ? seats : null;
}

function expired(value: string): boolean {
	return value < new Date().toISOString().slice(0, 10);
}

export default function LicencesPage() {
	const { t } = useI18n();
	const list = useEngine("/licences");
	const save = useEngineMutation("/licences/create");
	const grant = useEngineMutation("/licences/grant");
	const revoke = useEngineMutation("/licences/revoke");
	const [name, setName] = useState("");
	const [seats, setSeats] = useState("");
	const [expiresOn, setExpiresOn] = useState("");
	const [chosen, setChosen] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("licencesDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = list.data as LicenceList;
	const seatCount = wholeSeats(seats);
	const dateReady =
		/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) && !expired(expiresOn);
	const formReady = name.trim().length > 0 && seatCount !== null && dateReady;
	const grantable = data.licences.find(
		(row) => !expired(row.expiresOn) && row.seatsUsed < row.seats,
	);
	const inkGrant = grantable?.id ?? null;
	const inkRevoke =
		inkGrant === null
			? (data.licences.find((row) => row.holders.length > 0)?.holders[0]
					?.grantId ?? null)
			: null;
	const saveIsInk = data.licences.length === 0;

	async function onSave() {
		if (!formReady || seatCount === null) return;
		setError(null);
		try {
			await save.mutateAsync({
				body: { name: name.trim(), seats: seatCount, expiresOn },
			});
			setName("");
			setSeats("");
			setExpiresOn("");
			await invalidateEngine("/licences");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	async function onGrant(licenceId: string) {
		const userId = Number(chosen[licenceId]);
		if (!Number.isInteger(userId)) return;
		setError(null);
		try {
			await grant.mutateAsync({ body: { licenceId, userId } });
			setChosen((current) => ({ ...current, [licenceId]: "" }));
			await invalidateEngine("/licences");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	async function onRevoke(grantId: string) {
		setError(null);
		try {
			await revoke.mutateAsync({ body: { grantId } });
			await invalidateEngine("/licences");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("licencesTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("licencesSentence")}
				</p>
			</div>
			{data.licences.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("licencesEmpty")}
				</p>
			) : (
				<table className="w-full border-collapse text-left">
					<thead>
						<tr className="font-meta text-xs uppercase text-fg-muted">
							<th className="border-b border-line py-2 font-semibold">
								{t("licencesName")}
							</th>
							<th className="border-b border-line py-2 font-semibold">
								{t("licencesSeats")}
							</th>
							<th className="border-b border-line py-2 font-semibold">
								{t("licencesExpiry")}
							</th>
							<th className="border-b border-line py-2 font-semibold">
								{t("licencesPerson")}
							</th>
						</tr>
					</thead>
					<tbody>
						{data.licences.map((row) => {
							const over = expired(row.expiresOn);
							const free = !over && row.seatsUsed < row.seats;
							const person = chosen[row.id] ?? "";
							return (
								<tr key={row.id}>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{row.name}
									</td>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{t("licencesSeatsValue", {
											used: String(row.seatsUsed),
											seats: String(row.seats),
										})}
									</td>
									<td className="border-b border-line py-3">
										<span className="flex items-center gap-2">
											{over ? (
												<Badge variant="danger">{t("badgeExpired")}</Badge>
											) : null}
											<span className="font-sans text-lg text-fg">
												{row.expiresOn}
											</span>
										</span>
									</td>
									<td className="border-b border-line py-3">
										{row.holders.length === 0 ? (
											<p className="font-sans text-lg text-fg">
												{t("licencesNone")}
											</p>
										) : (
											<ul className="flex flex-col gap-2">
												{row.holders.map((holder) => (
													<li
														key={holder.grantId}
														className="flex items-center gap-3"
													>
														<span className="font-sans text-lg text-fg">
															{holder.name}
														</span>
														<Button
															type="button"
															variant={
																holder.grantId === inkRevoke ? "ink" : "quiet"
															}
															onClick={() => void onRevoke(holder.grantId)}
														>
															{t("licencesRevoke")}
														</Button>
													</li>
												))}
											</ul>
										)}
										{free ? (
											<div className="mt-3 flex flex-col gap-2">
												<label
													className="font-meta text-xs font-semibold uppercase tracking-wide text-fg"
													htmlFor={`licence-${row.id}`}
												>
													{t("licencesChoose")}
												</label>
												<select
													id={`licence-${row.id}`}
													className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
													value={person}
													onChange={(event) =>
														setChosen((current) => ({
															...current,
															[row.id]: event.target.value,
														}))
													}
												>
													<option value="">{t("licencesChoose")}</option>
													{data.learners.map((learner) => (
														<option key={learner.id} value={learner.id}>
															{learner.name}
														</option>
													))}
												</select>
												{person ? (
													<Button
														type="button"
														variant={row.id === inkGrant ? "ink" : "quiet"}
														className="w-fit"
														onClick={() => void onGrant(row.id)}
													>
														{t("licencesGrant")}
													</Button>
												) : null}
											</div>
										) : null}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			)}
			<form
				className="flex max-w-sm flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					void onSave();
				}}
			>
				<label className="flex flex-col gap-2" htmlFor="licence-name">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("licencesName")}
					</span>
					<Input
						id="licence-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="licence-seats">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("licencesSeats")}
					</span>
					<Input
						id="licence-seats"
						inputMode="numeric"
						value={seats}
						onChange={(event) => setSeats(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="licence-expiry">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("licencesExpiry")}
					</span>
					<Input
						id="licence-expiry"
						type="date"
						value={expiresOn}
						onChange={(event) => setExpiresOn(event.target.value)}
					/>
				</label>
				{formReady ? (
					<Button
						type="submit"
						variant={saveIsInk ? "ink" : "soft"}
						className="w-fit"
					>
						{t("licencesSave")}
					</Button>
				) : null}
				{error ? <p className="text-lg text-destructive">{error}</p> : null}
			</form>
		</section>
	);
}

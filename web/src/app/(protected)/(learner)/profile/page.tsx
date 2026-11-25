import { type FormEvent, useState } from "react";
import { AccountSecurity } from "@/components/auth/account-security";
import { PrivacyActions } from "@/components/auth/privacy-actions";
import { SubjectTools } from "@/components/auth/subject-tools";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
	type EngineResponse,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type Profile = EngineResponse<"/profile">;
type Purpose = Profile["consents"][number]["purpose"];

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	if (error.status === 429) return "tooManyAttempts";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "guardian_required":
			return "guardianRequired";
		case "minor_visibility":
			return "minorVisibility";
		case "invalid_date":
			return "invalidDate";
		default:
			return "tryAgain";
	}
}

function purposeTitle(purpose: Purpose): MessageKey {
	switch (purpose) {
		case "terms":
			return "consentTerms";
		case "data_use":
			return "consentData";
		case "public_passport":
			return "consentPassport";
		case "leaderboard":
			return "consentLeaderboard";
		case "mentor_contact":
			return "consentMentor";
		case "success_story":
			return "consentStory";
		case "guardian":
			return "consentGuardian";
		default: {
			const unreachable: never = purpose;
			return unreachable;
		}
	}
}

function lockedForMinor(purpose: Purpose): boolean {
	switch (purpose) {
		case "public_passport":
		case "mentor_contact":
		case "success_story":
			return true;
		case "terms":
		case "data_use":
		case "leaderboard":
		case "guardian":
			return false;
		default: {
			const unreachable: never = purpose;
			return unreachable;
		}
	}
}

function ProfileEditor({
	profile,
	onChanged,
}: {
	profile: Profile;
	onChanged: () => Promise<void>;
}) {
	const { t } = useI18n();
	const [name, setName] = useState(profile.name ?? "");
	const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth ?? "");
	const [district, setDistrict] = useState(profile.district ?? "");
	const [sector, setSector] = useState(profile.sector ?? "");
	const [village, setVillage] = useState(profile.village ?? "");
	const [economicSector, setEconomicSector] = useState(
		profile.economicSector ?? "",
	);
	const [guardian, setGuardian] = useState(profile.guardianContact ?? "");
	const [locale, setLocale] = useState<"rw" | "en">(
		profile.locale === "en" ? "en" : "rw",
	);
	const [error, setError] = useState<MessageKey | null>(null);
	const [tab, setTab] = useState<"details" | "consent" | "record" | "sessions">(
		"details",
	);
	const save = useEngineMutation("/profile/update");
	const consent = useEngineMutation("/consents");

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await save.mutateAsync({
				body: {
					name,
					dateOfBirth,
					district,
					sector,
					village,
					economicSector,
					locale,
					guardianContact: guardian,
				},
			});
			await onChanged();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<div className="max-w-xl">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("profileTitle")}
			</h1>
			<p className="mt-4 font-sans text-lg font-medium text-fg">
				{t("profileSentence")}
			</p>
			<div
				role="tablist"
				aria-label={t("profileTitle")}
				className="mt-8 flex gap-2"
			>
				{(
					[
						["details", "detailsTab"],
						["consent", "consentTab"],
						["record", "recordTab"],
						["sessions", "sessionsTab"],
					] as const
				).map(([value, label]) => (
					<button
						key={value}
						type="button"
						role="tab"
						aria-selected={tab === value}
						className={
							tab === value
								? "inline-flex min-h-11 items-center rounded-full bg-ink px-4 font-sans text-sm font-semibold text-ink-fg"
								: "inline-flex min-h-11 items-center rounded-full px-4 font-sans text-sm font-semibold text-fg hover:bg-surface"
						}
						onClick={() => setTab(value)}
					>
						{t(label)}
					</button>
				))}
			</div>
			{tab === "sessions" ? (
				<div role="tabpanel">
					<AccountSecurity />
				</div>
			) : null}
			{tab === "details" ? (
				<div role="tabpanel">
					<form className="mt-8 flex flex-col gap-4" onSubmit={onSubmit}>
						<label className="flex flex-col gap-2" htmlFor="profile-name">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("nameLabel")}
							</span>
							<Input
								id="profile-name"
								className="h-11"
								value={name}
								onChange={(event) => setName(event.target.value)}
								required
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="profile-dob">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("dateOfBirthLabel")}
							</span>
							<Input
								id="profile-dob"
								className="h-11"
								type="date"
								value={dateOfBirth}
								onChange={(event) => setDateOfBirth(event.target.value)}
								required
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="profile-district">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("districtLabel")}
							</span>
							<Input
								id="profile-district"
								className="h-11"
								value={district}
								onChange={(event) => setDistrict(event.target.value)}
								required
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="profile-sector">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("sectorLabel")}
							</span>
							<Input
								id="profile-sector"
								className="h-11"
								value={sector}
								onChange={(event) => setSector(event.target.value)}
								required
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="profile-village">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("villageLabel")}
							</span>
							<Input
								id="profile-village"
								className="h-11"
								value={village}
								onChange={(event) => setVillage(event.target.value)}
								required
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="profile-work">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("economicSectorLabel")}
							</span>
							<Input
								id="profile-work"
								className="h-11"
								value={economicSector}
								onChange={(event) => setEconomicSector(event.target.value)}
								required
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="profile-guardian">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("guardianLabel")}
							</span>
							<Input
								id="profile-guardian"
								className="h-11"
								value={guardian}
								onChange={(event) => setGuardian(event.target.value)}
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="profile-locale">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("localeLabel")}
							</span>
							<select
								id="profile-locale"
								className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 font-sans text-fg"
								value={locale}
								onChange={(event) =>
									setLocale(event.target.value === "en" ? "en" : "rw")
								}
							>
								<option value="rw">{t("kinyarwanda")}</option>
								<option value="en">{t("english")}</option>
							</select>
						</label>
						{error ? (
							<p
								className="font-sans text-sm font-medium text-danger"
								role="alert"
							>
								{t(error)}
							</p>
						) : null}
						{name.trim() &&
						dateOfBirth &&
						district.trim() &&
						sector.trim() &&
						village.trim() &&
						economicSector.trim() ? (
							<div>
								<Button
									type="submit"
									variant="sticker"
									disabled={save.isPending}
								>
									{t("saveProfile")}
								</Button>
							</div>
						) : null}
					</form>
				</div>
			) : null}
			{tab === "consent" ? (
				<div role="tabpanel">
					<section className="mt-8">
						<h2 className="font-sans text-2xl font-semibold text-fg">
							{t("consentHeading")}
						</h2>
						{profile.minor ? (
							<p className="mt-3 font-sans text-sm font-medium text-fg">
								{t("minorVisibility")}
							</p>
						) : null}
						<ul className="mt-4 flex flex-col rounded-[20px] bg-surface px-5">
							{profile.consents.map((row) => {
								const locked = profile.minor && lockedForMinor(row.purpose);
								const name = t(purposeTitle(row.purpose));
								const held = locked && !row.granted;
								return (
									<li
										key={row.purpose}
										className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0"
									>
										<div>
											<p className="font-sans text-lg font-semibold text-fg">
												{name}
											</p>
											<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
												{row.granted ? t("consentOn") : t("consentOff")}
											</p>
										</div>
										<Switch
											checked={row.granted}
											disabled={consent.isPending || held}
											label={`${name}, ${row.granted ? t("withdrawConsent") : t("allowConsent")}`}
											onToggle={() => {
												setError(null);
												consent.mutate(
													{
														body: {
															purpose: row.purpose,
															granted: !row.granted,
														},
													},
													{
														onSuccess: () => void onChanged(),
														onError: (caught) => setError(reasonKey(caught)),
													},
												);
											}}
										/>
									</li>
								);
							})}
						</ul>
						{error ? (
							<p
								className="mt-4 font-sans text-sm font-medium text-danger"
								role="alert"
							>
								{t(error)}
							</p>
						) : null}
					</section>
				</div>
			) : null}
			{tab === "record" ? (
				<div role="tabpanel" className="mt-8">
					<SubjectTools />
					<PrivacyActions />
				</div>
			) : null}
		</div>
	);
}

export default function ProfilePage() {
	const { t } = useI18n();
	const profile = useEngine("/profile");
	if (profile.isLoading) return <Spinner label={t("profileTitle")} />;
	if (!profile.data) {
		return (
			<p className="font-sans text-lg font-medium text-fg" role="alert">
				{t("tryAgain")}
			</p>
		);
	}
	return (
		<ProfileEditor
			key={profile.dataUpdatedAt}
			profile={profile.data}
			onChanged={() => profile.invalidate()}
		/>
	);
}

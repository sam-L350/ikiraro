import { type FormEvent, type ReactNode, useState } from "react";
import { useNavigate } from "react-router";
import { SharedComputerCheck } from "@/components/auth/shared-computer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { isApiClientError, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type ConsentPurpose =
	| "terms"
	| "data_use"
	| "public_passport"
	| "leaderboard"
	| "mentor_contact"
	| "success_story"
	| "guardian";

const largeField =
	"h-14 rounded-2xl px-4 font-sans text-2xl tracking-[0.2em] tabular-nums";

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	if (error.status === 429) return "tooManyAttempts";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "invalid_phone":
			return "invalidPhone";
		case "wrong_code":
			return "wrongCode";
		case "phone_taken":
			return "phoneTaken";
		case "guardian_required":
			return "guardianRequired";
		case "consent_required":
			return "consentRequired";
		case "minor_visibility":
			return "minorVisibility";
		case "already_active":
			return "alreadyActive";
		case "not_active":
			return "notActive";
		case "invalid_date":
			return "invalidDate";
		default:
			return "tryAgain";
	}
}

function isMinor(dateOfBirth: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
	const [year, month, day] = dateOfBirth.split("-").map(Number) as [
		number,
		number,
		number,
	];
	const adultOn = Date.UTC(year + 18, month - 1, day);
	const now = new Date();
	const current = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate(),
	);
	return adultOn > current;
}

function Field({
	id,
	label,
	help,
	children,
}: {
	id: string;
	label: string;
	help?: string;
	children: ReactNode;
}) {
	return (
		<label className="flex w-full flex-col gap-2" htmlFor={id}>
			<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
				{label}
			</span>
			{children}
			{help ? (
				<span className="font-sans text-sm font-medium text-fg">{help}</span>
			) : null}
		</label>
	);
}

function ConsentBox({
	checked,
	disabled,
	title,
	body,
	onChange,
}: {
	checked: boolean;
	disabled?: boolean;
	title: string;
	body: string;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-start gap-3 py-2">
			<input
				type="checkbox"
				className="mt-1 size-5 accent-ink"
				checked={checked}
				disabled={disabled}
				onChange={(event) => onChange(event.target.checked)}
			/>
			<span>
				<span className="block font-sans font-semibold text-fg">{title}</span>
				<span className="mt-1 block font-sans text-sm font-medium text-fg">
					{body}
				</span>
			</span>
		</label>
	);
}

export function ActivationForm({ phone }: { phone: string }) {
	const { t } = useI18n();
	const { refresh } = useAuth();
	const navigate = useNavigate();
	const [number, setNumber] = useState(phone);
	const [code, setCode] = useState("");
	const [shared, setShared] = useState(false);
	const [error, setError] = useState<MessageKey | null>(null);
	const send = useEngineMutation("/auth/otp");
	const activate = useEngineMutation("/registrations/activation");

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await activate.mutateAsync({
				body: { phone: number, code, sharedDevice: shared },
			});
			await refresh();
			navigate("/home");
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<form className="mt-4 flex w-full flex-col gap-4" onSubmit={onSubmit}>
			<p className="font-sans text-lg font-medium text-fg">
				{t("activationSentence")}
			</p>
			<Field id="activate-phone" label={t("phoneLabel")}>
				<Input
					id="activate-phone"
					className={largeField}
					inputMode="tel"
					autoComplete="tel"
					value={number}
					onChange={(event) => setNumber(event.target.value)}
					required
				/>
			</Field>
			<Field id="activate-code" label={t("codeLabel")}>
				<Input
					id="activate-code"
					className={largeField}
					inputMode="numeric"
					autoComplete="one-time-code"
					value={code}
					aria-invalid={error ? true : undefined}
					onChange={(event) => setCode(event.target.value)}
					required
				/>
			</Field>
			{error ? (
				<p className="font-sans text-sm font-medium text-danger" role="alert">
					{t(error)}
				</p>
			) : null}
			{import.meta.env.DEV ? (
				<p className="font-sans text-sm text-fg-muted">{t("devCodeHint")}</p>
			) : null}
			<SharedComputerCheck checked={shared} onChange={setShared} />
			<div className="mt-2 flex flex-col items-start gap-2">
				<Button type="submit" variant="sticker" disabled={activate.isPending}>
					{t("activateAccount")}
				</Button>
				<Button
					type="button"
					variant="quiet"
					className="px-0"
					disabled={send.isPending}
					onClick={() => {
						setError(null);
						send.mutate(
							{ body: { phone: number } },
							{ onError: (caught) => setError(reasonKey(caught)) },
						);
					}}
				>
					{t("sendNewCode")}
				</Button>
			</div>
		</form>
	);
}

export function RegistrationForm({
	mode,
	trainerName,
}: {
	mode: "self" | "assisted";
	trainerName?: string | null;
}) {
	const { t, locale } = useI18n();
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const [dateOfBirth, setDateOfBirth] = useState("");
	const [district, setDistrict] = useState("");
	const [sector, setSector] = useState("");
	const [village, setVillage] = useState("");
	const [economicSector, setEconomicSector] = useState("");
	const [gender, setGender] = useState("");
	const [email, setEmail] = useState("");
	const [guardian, setGuardian] = useState("");
	const [language, setLanguage] = useState(locale);
	const [terms, setTerms] = useState(false);
	const [dataUse, setDataUse] = useState(false);
	const [passport, setPassport] = useState(false);
	const [leaderboard, setLeaderboard] = useState(false);
	const [mentor, setMentor] = useState(false);
	const [story, setStory] = useState(false);
	const [guardianConsent, setGuardianConsent] = useState(false);
	const [error, setError] = useState<MessageKey | null>(null);
	const [done, setDone] = useState<{ name: string; phone: string } | null>(
		null,
	);
	const [awaitingCode, setAwaitingCode] = useState<string | null>(null);
	const self = useEngineMutation("/registrations");
	const assisted = useEngineMutation("/registrations/assisted");
	const minor = isMinor(dateOfBirth);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (!terms || !dataUse) {
			setError("consentRequired");
			return;
		}
		if (minor && (!guardian.trim() || !guardianConsent)) {
			setError("guardianRequired");
			return;
		}
		const consents: { purpose: ConsentPurpose; granted: boolean }[] = [
			{ purpose: "terms", granted: true },
			{ purpose: "data_use", granted: true },
			{ purpose: "public_passport", granted: minor ? false : passport },
			{ purpose: "leaderboard", granted: leaderboard },
			{ purpose: "mentor_contact", granted: minor ? false : mentor },
			{ purpose: "success_story", granted: minor ? false : story },
		];
		if (minor) consents.push({ purpose: "guardian", granted: true });
		const body = {
			name,
			phone,
			dateOfBirth,
			district,
			sector,
			village,
			economicSector,
			locale: language,
			consents,
			...(email.trim() ? { email: email.trim() } : {}),
			...(gender ? { gender } : {}),
			...(guardian.trim() ? { guardianContact: guardian.trim() } : {}),
		};
		try {
			const created =
				mode === "assisted"
					? await assisted.mutateAsync({ body })
					: await self.mutateAsync({ body });
			if (mode === "assisted")
				setDone({ name: created.name, phone: created.phone });
			else setAwaitingCode(created.phone);
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	if (awaitingCode) return <ActivationForm phone={awaitingCode} />;

	if (done) {
		return (
			<div className="mt-4 flex flex-col gap-4">
				<p className="font-sans text-lg font-medium text-fg">
					{t("assistedDone", done)}
				</p>
				<p className="font-sans text-lg font-medium text-fg">
					{t("learnerConfirms")}
				</p>
			</div>
		);
	}

	const pending = self.isPending || assisted.isPending;

	return (
		<form className="mt-4 flex w-full flex-col gap-4" onSubmit={onSubmit}>
			{mode === "assisted" && trainerName ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("registeringAs", { name: trainerName })}
				</p>
			) : null}
			<Field id="reg-name" label={t("nameLabel")}>
				<Input
					id="reg-name"
					className="h-11"
					value={name}
					onChange={(event) => setName(event.target.value)}
					required
				/>
			</Field>
			<Field id="reg-phone" label={t("phoneLabel")}>
				<Input
					id="reg-phone"
					className={largeField}
					inputMode="tel"
					autoComplete="tel"
					value={phone}
					onChange={(event) => setPhone(event.target.value)}
					required
				/>
			</Field>
			<Field id="reg-dob" label={t("dateOfBirthLabel")}>
				<Input
					id="reg-dob"
					className="h-11"
					type="date"
					value={dateOfBirth}
					onChange={(event) => setDateOfBirth(event.target.value)}
					required
				/>
			</Field>
			<Field id="reg-district" label={t("districtLabel")}>
				<Input
					id="reg-district"
					className="h-11"
					value={district}
					onChange={(event) => setDistrict(event.target.value)}
					required
				/>
			</Field>
			<Field id="reg-sector" label={t("sectorLabel")}>
				<Input
					id="reg-sector"
					className="h-11"
					value={sector}
					onChange={(event) => setSector(event.target.value)}
					required
				/>
			</Field>
			<Field id="reg-village" label={t("villageLabel")}>
				<Input
					id="reg-village"
					className="h-11"
					value={village}
					onChange={(event) => setVillage(event.target.value)}
					required
				/>
			</Field>
			<Field
				id="reg-work"
				label={t("economicSectorLabel")}
				help={t("economicSectorHelp")}
			>
				<Input
					id="reg-work"
					className="h-11"
					value={economicSector}
					onChange={(event) => setEconomicSector(event.target.value)}
					required
				/>
			</Field>
			<Field id="reg-gender" label={t("genderLabel")}>
				<select
					id="reg-gender"
					className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 font-sans text-fg"
					value={gender}
					onChange={(event) => setGender(event.target.value)}
				>
					<option value="">{t("genderUnset")}</option>
					<option value="female">{t("genderFemale")}</option>
					<option value="male">{t("genderMale")}</option>
					<option value="other">{t("genderOther")}</option>
				</select>
			</Field>
			<Field id="reg-locale" label={t("localeLabel")}>
				<select
					id="reg-locale"
					className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 font-sans text-fg"
					value={language}
					onChange={(event) =>
						setLanguage(event.target.value === "en" ? "en" : "rw")
					}
				>
					<option value="rw">{t("kinyarwanda")}</option>
					<option value="en">{t("english")}</option>
				</select>
			</Field>
			<Field id="reg-email" label={t("emailLabel")}>
				<Input
					id="reg-email"
					className="h-11"
					type="email"
					value={email}
					onChange={(event) => setEmail(event.target.value)}
				/>
			</Field>
			<Field
				id="reg-guardian"
				label={t("guardianLabel")}
				help={t("guardianHelp")}
			>
				<Input
					id="reg-guardian"
					className="h-11"
					value={guardian}
					onChange={(event) => setGuardian(event.target.value)}
					required={minor}
				/>
			</Field>
			<div className="mt-2 flex flex-col">
				<ConsentBox
					title={t("consentTerms")}
					body={t("consentTermsBody")}
					checked={terms}
					onChange={setTerms}
				/>
				<ConsentBox
					title={t("consentData")}
					body={t("consentDataBody")}
					checked={dataUse}
					onChange={setDataUse}
				/>
				<ConsentBox
					title={t("consentPassport")}
					body={t("consentPassportBody")}
					checked={minor ? false : passport}
					disabled={minor}
					onChange={setPassport}
				/>
				<ConsentBox
					title={t("consentLeaderboard")}
					body={t("consentLeaderboardBody")}
					checked={leaderboard}
					onChange={setLeaderboard}
				/>
				<ConsentBox
					title={t("consentMentor")}
					body={t("consentMentorBody")}
					checked={minor ? false : mentor}
					disabled={minor}
					onChange={setMentor}
				/>
				<ConsentBox
					title={t("consentStory")}
					body={t("consentStoryBody")}
					checked={minor ? false : story}
					disabled={minor}
					onChange={setStory}
				/>
				{minor ? (
					<ConsentBox
						title={t("consentGuardian")}
						body={t("consentGuardianBody")}
						checked={guardianConsent}
						onChange={setGuardianConsent}
					/>
				) : null}
			</div>
			{minor ? (
				<p className="font-sans text-sm font-medium text-fg">
					{t("minorVisibility")}
				</p>
			) : null}
			{error ? (
				<p className="font-sans text-sm font-medium text-danger" role="alert">
					{t(error)}
				</p>
			) : null}
			<div className="mt-2">
				<Button type="submit" variant="sticker" disabled={pending}>
					{mode === "assisted" ? t("registerLearner") : t("createMyAccount")}
				</Button>
			</div>
		</form>
	);
}

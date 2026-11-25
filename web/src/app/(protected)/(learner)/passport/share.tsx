import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	callEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "minor_visibility":
			return "minorVisibility";
		case "birth":
			return "shareBirth";
		case "passport_consent":
			return "shareConsent";
		default:
			return "tryAgain";
	}
}

function download(filename: string, blob: Blob) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

export function PassportShare() {
	const { locale, t } = useI18n();
	const share = useEngine("/passport/share");
	const rotate = useEngineMutation("/passport/share/rotate");
	const revoke = useEngineMutation("/passport/share/revoke");
	const save = useEngineMutation("/passport/share/update");
	const [error, setError] = useState<MessageKey | null>(null);
	const [downloading, setDownloading] = useState(false);

	if (share.isPending) {
		return <div className="h-28 animate-pulse rounded-[20px] bg-surface" />;
	}
	if (share.error || !share.data) {
		return (
			<p className="font-sans text-lg font-medium text-fg">{t("tryAgain")}</p>
		);
	}

	const data = share.data;
	const busy = rotate.isPending || revoke.isPending || save.isPending;

	async function createLink() {
		setError(null);
		try {
			await rotate.mutateAsync();
			await share.invalidate();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	async function turnOff() {
		setError(null);
		try {
			await revoke.mutateAsync();
			await share.invalidate();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	async function saveFlags(body: {
		photo?: boolean;
		center?: boolean;
		hours?: boolean;
		points?: boolean;
		level?: boolean;
		phone?: boolean;
		village?: boolean;
		hiddenBadges?: string[];
		hiddenTasks?: string[];
		publicEvidence?: string[];
	}) {
		setError(null);
		try {
			await save.mutateAsync({ body });
			await share.invalidate();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	async function downloadCard(kind: "pdf" | "image") {
		if (!data.token) return;
		setDownloading(true);
		setError(null);
		try {
			const card = await callEngine("/passports/:token/card", {
				query: { token: data.token, locale },
			});
			if (kind === "pdf") {
				const bytes = Uint8Array.from(atob(card.pdfBase64), (char) =>
					char.charCodeAt(0),
				);
				download(
					"ikiraro-passport.pdf",
					new Blob([bytes], { type: "application/pdf" }),
				);
			} else {
				download(
					"ikiraro-passport.svg",
					new Blob([card.imageSvg], { type: "image/svg+xml" }),
				);
			}
		} catch (caught) {
			setError(reasonKey(caught));
		} finally {
			setDownloading(false);
		}
	}

	const blockCopy =
		data.block === "minor"
			? t("minorVisibility")
			: data.block === "birth"
				? t("shareBirth")
				: data.block === "consent"
					? t("shareConsent")
					: null;

	return (
		<section className="rounded-[20px] bg-surface p-6">
			<h2 className="font-sans text-2xl font-semibold text-fg">
				{t("shareTitle")}
			</h2>
			{blockCopy ? (
				<p className="mt-3 max-w-xl font-sans text-lg font-medium text-fg">
					{blockCopy}{" "}
					{data.block === "consent" || data.block === "birth" ? (
						<Link className="underline underline-offset-4" to="/profile">
							{t("yourProfile")}
						</Link>
					) : null}
				</p>
			) : null}
			{data.block === "ok" && data.token ? (
				<div className="mt-4 rounded-2xl bg-canvas px-4 py-4">
					<p className="font-sans text-base font-medium text-fg">
						{t("shareLinkLabel")}
					</p>
					<p className="mt-2 break-all font-sans text-lg font-semibold text-fg">
						{`${window.location.origin}/p/${data.token}`}
					</p>
					<p className="mt-2 font-sans text-base font-medium text-fg-muted">
						{t("shareOldDies")}
					</p>
				</div>
			) : null}
			{data.block === "ok" ? (
				<div className="mt-4 flex flex-wrap items-center gap-3">
					<Button
						type="button"
						variant="sticker"
						disabled={busy}
						onClick={() => void createLink()}
					>
						{data.token ? t("shareRotate") : t("shareCreate")}
					</Button>
					{data.token ? (
						<Button
							type="button"
							variant="quiet"
							disabled={busy}
							onClick={() => void turnOff()}
						>
							{t("shareRevoke")}
						</Button>
					) : null}
					{data.token ? (
						<Button
							type="button"
							variant="quiet"
							disabled={busy || downloading}
							onClick={() => void downloadCard("pdf")}
						>
							{t("downloadPdf")}
						</Button>
					) : null}
					{data.token ? (
						<Button
							type="button"
							variant="quiet"
							disabled={busy || downloading}
							onClick={() => void downloadCard("image")}
						>
							{t("downloadImage")}
						</Button>
					) : null}
				</div>
			) : null}
			{data.block === "ok" ? (
				<div className="mt-4 flex flex-col divide-y divide-line">
					<Check
						label={t("sharePhoto")}
						checked={data.photo}
						disabled={busy}
						onChange={(photo) => void saveFlags({ photo })}
					/>
					<Check
						label={t("shareCenter")}
						checked={data.center}
						disabled={busy}
						onChange={(center) => void saveFlags({ center })}
					/>
					<Check
						label={t("shareHoursItem")}
						checked={data.hours}
						disabled={busy}
						onChange={(hours) => void saveFlags({ hours })}
					/>
					<Check
						label={t("sharePointsItem")}
						checked={data.points}
						disabled={busy}
						onChange={(points) => void saveFlags({ points })}
					/>
					<Check
						label={t("shareLevelItem")}
						checked={data.level}
						disabled={busy}
						onChange={(level) => void saveFlags({ level })}
					/>
					<Check
						label={t("sharePhoneItem")}
						checked={data.phone}
						disabled={busy}
						onChange={(phone) => void saveFlags({ phone })}
					/>
					<Check
						label={t("shareVillageItem")}
						checked={data.village}
						disabled={busy}
						onChange={(village) => void saveFlags({ village })}
					/>
					{data.badges.map((badge) => (
						<Check
							key={badge.id}
							label={textFor(locale, badge.titleRw, badge.titleEn)}
							checked={badge.shown}
							disabled={busy}
							onChange={(shown) =>
								void saveFlags({
									hiddenBadges: data.badges
										.filter((item) =>
											item.id === badge.id ? !shown : !item.shown,
										)
										.map((item) => item.id),
								})
							}
						/>
					))}
					{data.tasks.map((task) => (
						<Check
							key={task.id}
							label={textFor(locale, task.titleRw, task.titleEn)}
							checked={task.shown}
							disabled={busy}
							onChange={(shown) =>
								void saveFlags({
									hiddenTasks: data.tasks
										.filter((item) =>
											item.id === task.id ? !shown : !item.shown,
										)
										.map((item) => item.id),
								})
							}
						/>
					))}
					{data.evidence.map((item) => (
						<Check
							key={item.id}
							label={t("shareShowEvidence")}
							checked={item.shown}
							disabled={busy}
							onChange={(shown) =>
								void saveFlags({
									publicEvidence: data.evidence
										.filter((row) => (row.id === item.id ? shown : row.shown))
										.map((row) => row.id),
								})
							}
						/>
					))}
				</div>
			) : null}
			{error ? (
				<p className="mt-3 font-sans text-base font-medium text-danger">
					{t(error)}
				</p>
			) : null}
		</section>
	);
}

function Check({
	label,
	checked,
	disabled,
	onChange,
}: {
	label: string;
	checked: boolean;
	disabled: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex min-h-11 items-center justify-between gap-4 py-2">
			<span className="font-sans text-base font-medium text-fg">{label}</span>
			<Switch
				checked={checked}
				disabled={disabled}
				label={label}
				onToggle={() => onChange(!checked)}
			/>
		</div>
	);
}

function textFor(locale: "en" | "rw", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
}

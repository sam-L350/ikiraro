import { useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { callEngine, isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

export default function PublicPassportPage() {
	const { locale, t } = useI18n();
	const params = useParams();
	const token = params.token ?? "";
	const passport = useEngine(
		"/passports/:token",
		{ query: { token } },
		{ enabled: token.length > 0 },
	);

	if (
		!token ||
		(isApiClientError(passport.error) && passport.error.status === 404)
	) {
		return (
			<section className="mx-auto max-w-3xl px-6 py-16">
				<p className="font-sans text-2xl font-semibold text-fg">
					{t("publicPassportInvalid")}
				</p>
			</section>
		);
	}

	if (passport.isPending) {
		return (
			<div className="mx-auto max-w-3xl px-6 py-16">
				<div className="h-16 animate-pulse rounded-md bg-surface" />
			</div>
		);
	}

	if (passport.error || !passport.data) {
		return (
			<section className="mx-auto max-w-3xl px-6 py-16">
				<p className="text-lg text-destructive">{t("tryAgain")}</p>
			</section>
		);
	}

	const data = passport.data;
	const name = data.name.trim() || t("publicLearner");

	async function downloadCard(kind: "pdf" | "image") {
		const card = await callEngine("/passports/:token/card", {
			query: { token, locale },
		});
		if (kind === "pdf") {
			const bytes = Uint8Array.from(atob(card.pdfBase64), (char) =>
				char.charCodeAt(0),
			);
			save(
				"ikiraro-passport.pdf",
				new Blob([bytes], { type: "application/pdf" }),
			);
			return;
		}
		save(
			"ikiraro-passport.svg",
			new Blob([card.imageSvg], { type: "image/svg+xml" }),
		);
	}

	return (
		<section className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
			<div className="flex flex-col gap-4">
				<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
					{name}
				</h1>
				{data.photoUrl ? (
					<img
						src={data.photoUrl}
						alt={name}
						className="h-24 w-24 rounded-full object-cover"
					/>
				) : null}
				{data.centerName ? (
					<p className="text-lg text-fg">{data.centerName}</p>
				) : null}
				{data.verifiedMinutes !== null ? (
					<p className="text-lg text-fg">
						{hoursCopy(data.verifiedMinutes, t)}
					</p>
				) : null}
				{data.points !== null ? (
					<p className="text-lg text-fg">
						{t("passportPoints", { count: String(data.points) })}
					</p>
				) : null}
				{data.level !== null ? (
					<p className="text-lg text-fg">
						{t("passportLevel", { count: String(data.level) })}
					</p>
				) : null}
				{data.phone ? (
					<p className="text-lg text-fg">
						{t("publicPhone", { phone: data.phone })}
					</p>
				) : null}
				{data.village ? (
					<p className="text-lg text-fg">
						{t("publicVillage", { village: data.village })}
					</p>
				) : null}
			</div>
			<ul className="flex flex-col gap-6">
				{data.badges.map((badge) => {
					const title = textFor(locale, badge.titleRw, badge.titleEn);
					const skill = textFor(locale, badge.skillRw, badge.skillEn);
					return (
						<li key={badge.id} className="flex flex-col gap-2">
							<Badge variant="verified" className="w-fit">
								{title}
							</Badge>
							<p className="text-lg text-fg">{skill || title}</p>
							<p className="text-lg text-fg">
								{verifiedSentence(t, locale, badge)}
							</p>
						</li>
					);
				})}
			</ul>
			{(data.referrals ?? []).length > 0 ? (
				<ul className="flex flex-col gap-4">
					{(data.referrals ?? []).map((row) => (
						<li key={row.id}>
							<p className="text-lg text-fg">{row.note}</p>
							<p className="text-lg text-fg-muted">{row.authorName}</p>
						</li>
					))}
				</ul>
			) : null}
			{data.tasks.length > 0 ? (
				<ul className="flex flex-col">
					{data.tasks.map((task) => (
						<li
							key={task.id}
							className="flex flex-col gap-1 border-b border-line py-3"
						>
							<span className="text-lg text-fg">
								{textFor(locale, task.titleRw, task.titleEn)}
							</span>
							<p className="text-lg text-fg">
								{verifiedSentence(t, locale, task)}
							</p>
						</li>
					))}
				</ul>
			) : null}
			{data.evidence.some((item) => item.url) ? (
				<ul className="flex flex-col gap-4">
					{data.evidence.map((item) =>
						item.url ? (
							<li key={item.id}>
								<img
									src={item.url}
									alt={t("shareShowEvidence")}
									className="max-h-80 rounded-[20px]"
								/>
							</li>
						) : null,
					)}
				</ul>
			) : null}
			<div className="flex flex-wrap gap-3">
				<Button
					type="button"
					variant="quiet"
					onClick={() => void downloadCard("pdf")}
				>
					{t("downloadPdf")}
				</Button>
				<Button
					type="button"
					variant="quiet"
					onClick={() => void downloadCard("image")}
				>
					{t("downloadImage")}
				</Button>
			</div>
		</section>
	);
}

function verifiedSentence(
	t: (key: MessageKey, vars?: Record<string, string>) => string,
	locale: "en" | "rw",
	item: {
		verifierName: string;
		authorityRole:
			| "trainer"
			| "center_manager"
			| "district_coordinator"
			| "reviewer";
		centerName: string;
		verifiedAt: string;
	},
): string {
	const role = t(authorityKey(item.authorityRole));
	const authority = item.centerName
		? t("publicAuthorityAt", { role, center: item.centerName })
		: role;
	return t("publicVerified", {
		name: item.verifierName || t("publicAuthorityReviewer"),
		date: when(item.verifiedAt, locale),
		authority,
	});
}

function authorityKey(
	role: "trainer" | "center_manager" | "district_coordinator" | "reviewer",
): MessageKey {
	switch (role) {
		case "trainer":
			return "publicAuthorityTrainer";
		case "center_manager":
			return "publicAuthorityCenter";
		case "district_coordinator":
			return "publicAuthorityDistrict";
		case "reviewer":
			return "publicAuthorityReviewer";
		default: {
			const unreachable: never = role;
			return unreachable;
		}
	}
}

function hoursCopy(
	minutes: number,
	t: (
		key:
			| "passportHoursEmpty"
			| "passportHours"
			| "passportMinutes"
			| "passportHoursMinutes",
		vars?: Record<string, string>,
	) => string,
): string {
	if (minutes <= 0) return t("passportHoursEmpty");
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (rest === 0) return t("passportHours", { count: String(hours) });
	if (hours === 0) return t("passportMinutes", { count: String(rest) });
	return t("passportHoursMinutes", {
		hours: String(hours),
		minutes: String(rest),
	});
}

function textFor(locale: "en" | "rw", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
}

function when(value: string, locale: "en" | "rw"): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString(locale === "rw" ? "rw-RW" : "en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "Africa/Kigali",
	});
}

function save(filename: string, blob: Blob) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	callEngine,
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { prepareEvidenceFile } from "@/lib/media/prepare";

type Guide = {
	id: string;
	titleEn: string;
	titleRw: string;
	bodyEn: string;
	bodyRw: string;
	walkthrough: "audio" | "video" | null;
};

type Ticket = {
	id: string;
	kind: "technical" | "content" | "conduct";
	body: string;
	status: "open" | "answered" | "closed";
	minutes: number | null;
};

async function uploadImage(file: File): Promise<string | null> {
	const prepared = await prepareEvidenceFile(file);
	if (prepared === "too_large" || prepared === "type") return null;
	if (!prepared.contentType.startsWith("image/")) return null;
	const intent = await callEngine("/media/upload-intent", {
		body: { contentType: prepared.contentType, byteSize: prepared.bytes.size },
	});
	const put = await fetch(intent.uploadUrl, {
		method: "PUT",
		headers: { "content-type": intent.contentType },
		body: prepared.bytes,
		credentials: "omit",
	});
	if (!put.ok) return null;
	const finalized = await callEngine("/media/:id/finalize", {
		body: { id: intent.id, sha256: prepared.sha256 },
	});
	return finalized.id;
}

const KINDS: { value: Ticket["kind"]; label: MessageKey; route: MessageKey }[] =
	[
		{
			value: "technical",
			label: "helpKindTechnical",
			route: "helpRouteTechnical",
		},
		{ value: "content", label: "helpKindContent", route: "helpRouteContent" },
		{ value: "conduct", label: "helpKindConduct", route: "helpRouteConduct" },
	];

export default function HelpPage() {
	const { locale, t } = useI18n();
	const [q, setQ] = useState("");
	const [applied, setApplied] = useState("");
	const guides = useEngine("/help-guides", { query: { q: applied } });
	const tickets = useEngine("/tickets");
	const send = useEngineMutation("/tickets/create");
	const publish = useEngineMutation("/help-guides/create");
	const [kind, setKind] = useState("");
	const [body, setBody] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [titleEn, setTitleEn] = useState("");
	const [titleRw, setTitleRw] = useState("");
	const [bodyEn, setBodyEn] = useState("");
	const [bodyRw, setBodyRw] = useState("");
	const [formError, setFormError] = useState<string | null>(null);
	const ready = kind !== "" && body.trim() !== "";
	const guideReady =
		titleEn.trim() !== "" &&
		titleRw.trim() !== "" &&
		bodyEn.trim() !== "" &&
		bodyRw.trim() !== "";
	const route = KINDS.find((item) => item.value === kind);

	async function onSend(event: FormEvent) {
		event.preventDefault();
		if (!ready) return;
		setFormError(null);
		try {
			let mediaId: string | undefined;
			if (file) {
				const uploaded = await uploadImage(file);
				if (!uploaded) {
					setFormError(t("tryAgain"));
					return;
				}
				mediaId = uploaded;
			}
			await send.mutateAsync({
				body: { kind, body: body.trim(), ...(mediaId ? { mediaId } : {}) },
			});
			setKind("");
			setBody("");
			setFile(null);
			await invalidateEngine("/tickets");
		} catch (error) {
			setFormError(error instanceof Error ? error.message : t("tryAgain"));
		}
	}

	async function onPublish(event: FormEvent) {
		event.preventDefault();
		if (!guideReady) return;
		setFormError(null);
		try {
			await publish.mutateAsync({
				body: {
					titleEn: titleEn.trim(),
					titleRw: titleRw.trim(),
					bodyEn: bodyEn.trim(),
					bodyRw: bodyRw.trim(),
				},
			});
			setTitleEn("");
			setTitleRw("");
			setBodyEn("");
			setBodyRw("");
			await invalidateEngine("/help-guides");
		} catch (error) {
			setFormError(error instanceof Error ? error.message : t("tryAgain"));
		}
	}

	const guideRows = (guides.data?.guides ?? []) as Guide[];
	const mine = (tickets.data?.mine ?? []) as Ticket[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("helpTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("helpSentence")}
				</p>
			</div>
			<form
				className="flex flex-col gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					setApplied(q.trim());
				}}
			>
				<label className="flex flex-col gap-2" htmlFor="help-search">
					<span className="font-meta text-xs uppercase text-fg-muted">
						{t("helpSearch")}
					</span>
					<input
						id="help-search"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={q}
						onChange={(event) => setQ(event.target.value)}
					/>
				</label>
				<Button type="submit" variant="quiet" className="w-fit">
					{t("helpSearch")}
				</Button>
			</form>
			{guides.isPending ? (
				<div className="h-16 animate-pulse rounded-md bg-surface" />
			) : guideRows.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("helpSearchEmpty")}
				</p>
			) : (
				<ul className="flex flex-col gap-4">
					{guideRows.map((guide) => (
						<li key={guide.id} className="flex flex-col gap-2">
							<h2 className="font-sans text-2xl font-semibold text-fg">
								{locale === "rw" && guide.titleRw
									? guide.titleRw
									: guide.titleEn}
							</h2>
							<p className="font-sans text-lg text-fg">
								{locale === "rw" && guide.bodyRw ? guide.bodyRw : guide.bodyEn}
							</p>
						</li>
					))}
				</ul>
			)}
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void onSend(event)}
			>
				<label className="flex flex-col gap-2" htmlFor="help-kind">
					<span className="font-meta text-xs uppercase text-fg-muted">
						{t("helpKind")}
					</span>
					<select
						id="help-kind"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={kind}
						onChange={(event) => setKind(event.target.value)}
					>
						<option value="">{t("helpKind")}</option>
						{KINDS.map((item) => (
							<option key={item.value} value={item.value}>
								{t(item.label)}
							</option>
						))}
					</select>
				</label>
				{route ? (
					<p className="font-sans text-lg text-fg">{t(route.route)}</p>
				) : null}
				<label className="flex flex-col gap-2" htmlFor="help-body">
					<span className="font-meta text-xs uppercase text-fg-muted">
						{t("helpBody")}
					</span>
					<textarea
						id="help-body"
						className="min-h-28 rounded-md border border-line bg-card px-3 py-2 font-sans text-lg text-fg"
						value={body}
						onChange={(event) => setBody(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="help-photo">
					<span className="font-meta text-xs uppercase text-fg-muted">
						{t("helpScreenshot")}
					</span>
					<input
						id="help-photo"
						type="file"
						accept="image/*"
						onChange={(event) => setFile(event.target.files?.[0] ?? null)}
					/>
				</label>
				{formError ? (
					<p className="font-sans text-lg text-destructive">{formError}</p>
				) : null}
				{ready ? (
					<Button type="submit" variant="ink" className="w-fit">
						{t("helpSend")}
					</Button>
				) : null}
			</form>
			<section className="flex flex-col gap-3">
				<h2 className="font-sans text-2xl font-semibold text-fg">
					{t("helpMine")}
				</h2>
				{mine.length === 0 ? null : (
					<ul className="flex flex-col gap-3">
						{mine.map((ticket) => (
							<li key={ticket.id} className="font-sans text-lg text-fg">
								{ticket.body} ·{" "}
								{ticket.minutes !== null
									? t("helpAnswered", { minutes: String(ticket.minutes) })
									: ticket.status === "closed"
										? t("helpClosedQuiet")
										: t("helpWaiting")}
							</li>
						))}
					</ul>
				)}
			</section>
			{guides.data?.canWrite ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onPublish(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="guide-title-en">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("helpGuideTitle")}
						</span>
						<input
							id="guide-title-en"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={titleEn}
							onChange={(event) => setTitleEn(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="guide-title-rw">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("helpGuideTitle")}
						</span>
						<input
							id="guide-title-rw"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={titleRw}
							onChange={(event) => setTitleRw(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="guide-body-en">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("helpGuideBody")}
						</span>
						<textarea
							id="guide-body-en"
							className="min-h-28 rounded-md border border-line bg-card px-3 py-2 font-sans text-lg text-fg"
							value={bodyEn}
							onChange={(event) => setBodyEn(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="guide-body-rw">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("helpGuideBody")}
						</span>
						<textarea
							id="guide-body-rw"
							className="min-h-28 rounded-md border border-line bg-card px-3 py-2 font-sans text-lg text-fg"
							value={bodyRw}
							onChange={(event) => setBodyRw(event.target.value)}
						/>
					</label>
					{guideReady ? (
						<Button type="submit" variant="quiet" className="w-fit">
							{t("helpGuidePublish")}
						</Button>
					) : null}
				</form>
			) : null}
			{isApiClientError(guides.error) ? (
				<p className="font-sans text-lg text-destructive">{t("tryAgain")}</p>
			) : null}
		</section>
	);
}

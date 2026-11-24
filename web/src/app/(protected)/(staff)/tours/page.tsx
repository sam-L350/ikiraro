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

type TourCenter = { id: string; name: string };
type TourSession = {
	id: string;
	topic: string;
	startsAt: string;
	minutes: number;
	capacity: number;
	signedUp: number;
};
type TourPerson = {
	userId: number;
	name: string;
	sessionId: string;
	attended: boolean;
	linked: boolean;
};
type TourRow = {
	id: string;
	place: string;
	homeCenterId: string;
	homeCenterName: string;
	sessions: TourSession[];
	people: TourPerson[];
};
type TourList = { tours: TourRow[]; centers: TourCenter[] };

function whole(value: string, min: number, max: number): number | null {
	if (!/^\d+$/.test(value.trim())) return null;
	const number = Number(value);
	return number >= min && number <= max ? number : null;
}

export default function ToursPage() {
	const { t, locale } = useI18n();
	const list = useEngine("/tours");
	const save = useEngineMutation("/tours/create");
	const add = useEngineMutation("/tours/session");
	const attend = useEngineMutation("/tours/attend");
	const link = useEngineMutation("/tours/link");
	const [place, setPlace] = useState("");
	const [centerId, setCenterId] = useState("");
	const [tourId, setTourId] = useState("");
	const [topic, setTopic] = useState("");
	const [startsAt, setStartsAt] = useState("");
	const [minutes, setMinutes] = useState("");
	const [capacity, setCapacity] = useState("");
	const [error, setError] = useState<string | null>(null);

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("toursDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = list.data as TourList;
	const formReady = place.trim().length > 0 && centerId.length > 0;
	const sessionMinutes = whole(minutes, 15, 480);
	const sessionCapacity = whole(capacity, 1, 500);
	const sessionReady =
		tourId.length > 0 &&
		topic.trim().length > 0 &&
		startsAt.length > 0 &&
		sessionMinutes !== null &&
		sessionCapacity !== null;
	const saveIsInk = data.tours.length === 0;
	const inkLink = data.tours
		.flatMap((tour) => tour.people)
		.find((person) => person.attended && !person.linked);

	async function onSave() {
		if (!formReady) return;
		setError(null);
		try {
			await save.mutateAsync({
				body: { place: place.trim(), homeCenterId: centerId },
			});
			setPlace("");
			setCenterId("");
			await invalidateEngine("/tours");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	async function onSession() {
		if (!sessionReady || sessionMinutes === null || sessionCapacity === null)
			return;
		setError(null);
		try {
			await add.mutateAsync({
				body: {
					tourId,
					topic: topic.trim(),
					startsAt: new Date(startsAt).toISOString(),
					minutes: sessionMinutes,
					capacity: sessionCapacity,
				},
			});
			setTopic("");
			setStartsAt("");
			setMinutes("");
			setCapacity("");
			await invalidateEngine("/tours");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	async function onAttend(sessionId: string, userId: number) {
		setError(null);
		try {
			await attend.mutateAsync({ body: { sessionId, userId } });
			await invalidateEngine("/tours");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	async function onLink(rowTourId: string, userId: number) {
		setError(null);
		try {
			await link.mutateAsync({ body: { tourId: rowTourId, userId } });
			await invalidateEngine("/tours");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	const rows = data.tours.flatMap((tour) => {
		if (tour.sessions.length === 0) {
			return [
				{
					key: tour.id,
					place: tour.place,
					home: tour.homeCenterName,
					session: t("toursNoSession"),
					person: "",
					action: null as "attend" | "link" | null,
					sessionId: "",
					tourId: tour.id,
					userId: 0,
					linked: false,
				},
			];
		}
		return tour.sessions.flatMap((session) => {
			const people = tour.people.filter(
				(person) => person.sessionId === session.id,
			);
			const when = new Date(session.startsAt).toLocaleString(
				locale === "rw" ? "rw-RW" : "en-GB",
				{ dateStyle: "medium", timeStyle: "short" },
			);
			if (people.length === 0) {
				return [
					{
						key: session.id,
						place: tour.place,
						home: tour.homeCenterName,
						session: `${session.topic} · ${when}`,
						person: t("toursNoOne"),
						action: null,
						sessionId: session.id,
						tourId: tour.id,
						userId: 0,
						linked: false,
					},
				];
			}
			return people.map((person) => ({
				key: `${session.id}-${person.userId}`,
				place: tour.place,
				home: tour.homeCenterName,
				session: `${session.topic} · ${when}`,
				person: person.name,
				action: person.linked
					? null
					: person.attended
						? ("link" as const)
						: ("attend" as const),
				sessionId: session.id,
				tourId: tour.id,
				userId: person.userId,
				linked: person.linked,
			}));
		});
	});

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("toursTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("toursSentence")}
				</p>
			</div>
			{data.tours.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("toursEmpty")}
				</p>
			) : (
				<table className="w-full border-collapse text-left">
					<thead>
						<tr className="font-meta text-xs uppercase text-fg-muted">
							<th className="border-b border-line py-2 font-semibold">
								{t("toursPlace")}
							</th>
							<th className="border-b border-line py-2 font-semibold">
								{t("toursHome")}
							</th>
							<th className="border-b border-line py-2 font-semibold">
								{t("toursTopic")}
							</th>
							<th className="border-b border-line py-2 font-semibold">
								{t("toursPerson")}
							</th>
							<th className="border-b border-line py-2 font-semibold" />
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.key}>
								<td className="border-b border-line py-3 font-sans text-lg text-fg">
									{row.place}
								</td>
								<td className="border-b border-line py-3 font-sans text-lg text-fg">
									{row.home}
								</td>
								<td className="border-b border-line py-3 font-sans text-lg text-fg">
									{row.session}
								</td>
								<td className="border-b border-line py-3 font-sans text-lg text-fg">
									{row.person}
									{"linked" in row && row.linked ? (
										<Badge variant="neutral">{t("toursLinked")}</Badge>
									) : null}
								</td>
								<td className="border-b border-line py-3">
									{row.action === "attend" ? (
										<Button
											type="button"
											variant="quiet"
											onClick={() => void onAttend(row.sessionId, row.userId)}
										>
											{t("toursAttend")}
										</Button>
									) : null}
									{row.action === "link" ? (
										<Button
											type="button"
											variant={
												inkLink?.userId === row.userId &&
												inkLink?.sessionId === row.sessionId
													? "ink"
													: "quiet"
											}
											onClick={() => void onLink(row.tourId, row.userId)}
										>
											{t("toursLink")}
										</Button>
									) : null}
								</td>
							</tr>
						))}
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
				<label className="flex flex-col gap-2" htmlFor="tour-place">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("toursPlace")}
					</span>
					<Input
						id="tour-place"
						value={place}
						onChange={(event) => setPlace(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="tour-center">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("toursHome")}
					</span>
					<select
						id="tour-center"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={centerId}
						onChange={(event) => setCenterId(event.target.value)}
					>
						<option value="">{t("toursChooseCenter")}</option>
						{data.centers.map((center) => (
							<option key={center.id} value={center.id}>
								{center.name}
							</option>
						))}
					</select>
				</label>
				{formReady ? (
					<Button
						type="submit"
						variant={saveIsInk ? "ink" : "soft"}
						disabled={save.isPending}
					>
						{t("toursSave")}
					</Button>
				) : null}
			</form>
			{data.tours.length > 0 ? (
				<form
					className="flex max-w-sm flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						void onSession();
					}}
				>
					<label className="flex flex-col gap-2" htmlFor="tour-which">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("toursPlace")}
						</span>
						<select
							id="tour-which"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={tourId}
							onChange={(event) => setTourId(event.target.value)}
						>
							<option value="">{t("toursChooseCenter")}</option>
							{data.tours.map((tour) => (
								<option key={tour.id} value={tour.id}>
									{tour.place}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-2" htmlFor="tour-topic">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("toursTopic")}
						</span>
						<Input
							id="tour-topic"
							value={topic}
							onChange={(event) => setTopic(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="tour-when">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("toursWhen")}
						</span>
						<Input
							id="tour-when"
							type="datetime-local"
							value={startsAt}
							onChange={(event) => setStartsAt(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="tour-minutes">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("toursMinutes")}
						</span>
						<Input
							id="tour-minutes"
							inputMode="numeric"
							value={minutes}
							onChange={(event) => setMinutes(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="tour-capacity">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("toursCapacity")}
						</span>
						<Input
							id="tour-capacity"
							inputMode="numeric"
							value={capacity}
							onChange={(event) => setCapacity(event.target.value)}
						/>
					</label>
					{sessionReady ? (
						<Button type="submit" variant="quiet" disabled={add.isPending}>
							{t("toursAddSession")}
						</Button>
					) : null}
				</form>
			) : null}
			{error ? <p className="text-lg text-destructive">{error}</p> : null}
		</section>
	);
}

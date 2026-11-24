import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type OptIn = { id: string; skill: string; districtName: string };
type RequestRow = {
	id: string;
	mentorName: string;
	skill: string;
	districtName: string;
	status: "pending" | "accepted" | "declined";
};
type Application = {
	kind: "mentor" | "partner";
	weeklyContactCap: number;
	status: "pending" | "approved" | "declined";
};

export default function MentorsPage() {
	const { t } = useI18n();
	const own = useEngine("/mentors");
	const withdraw = useEngineMutation("/mentors/opt-out");

	if (own.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(own.error) && own.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("mentorsDenied")}
			</p>
		);
	}
	if (own.error || !own.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = own.data as {
		application: Application | null;
		optIns: OptIn[];
		requests: RequestRow[];
		mentorContact: boolean;
	};

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("mentorsTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("mentorsSentence")}
				</p>
			</div>
			{data.mentorContact ? (
				<Link
					to="/mentors/opt-in"
					className="font-sans text-lg font-medium text-fg underline"
				>
					{t("mentorsChoose")}
				</Link>
			) : (
				<p className="font-sans text-lg font-medium text-fg">
					{t("mentorsNeedConsent")}
				</p>
			)}
			{data.optIns.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("mentorsEmpty")}
				</p>
			) : (
				<ul>
					{data.optIns.map((row) => (
						<li
							key={row.id}
							className="flex items-center justify-between gap-4 border-t border-ink/15 py-4"
						>
							<p className="font-sans text-lg font-medium text-fg">
								{row.skill} · {row.districtName}
							</p>
							<Button
								type="button"
								variant="quiet"
								disabled={withdraw.isPending}
								onClick={() =>
									withdraw.mutate(
										{ body: { id: row.id } },
										{ onSuccess: () => void own.refetch() },
									)
								}
							>
								{t("mentorsWithdraw")}
							</Button>
						</li>
					))}
				</ul>
			)}
			<ul>
				{data.requests.map((row) => (
					<li key={row.id} className="border-t border-ink/15 py-4">
						{row.status === "pending" ? (
							<Link
								to={`/mentors/requests/${row.id}`}
								className="font-sans text-lg font-medium text-fg underline"
							>
								{row.mentorName} · {row.skill}
							</Link>
						) : (
							<p className="font-sans text-lg font-medium text-fg">
								{row.mentorName} · {row.skill} · {row.districtName}
							</p>
						)}
					</li>
				))}
			</ul>
			{data.application ? (
				<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{data.application.status === "approved"
						? t("mentorsApproved")
						: t("mentorsPending")}
					{" · "}
					{data.application.weeklyContactCap}
				</p>
			) : (
				<Link
					to="/mentors/apply"
					className="font-sans text-lg font-medium text-fg underline"
				>
					{t("mentorsApply")}
				</Link>
			)}
		</section>
	);
}

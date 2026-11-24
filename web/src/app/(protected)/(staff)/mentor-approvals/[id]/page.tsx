import { type FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Row = { id: string; name: string; kind: string; weeklyContactCap: number };

export default function MentorApprovalPage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { id = "" } = useParams();
	const list = useEngine("/mentor-approvals");
	const approve = useEngineMutation("/mentor-approvals/:id/approve");
	const decline = useEngineMutation("/mentor-approvals/:id/decline");
	const [note, setNote] = useState("");
	const items = (list.data?.items ?? []) as Row[];
	const row = items.find((item) => item.id === id);

	function declineWithNote(event: FormEvent) {
		event.preventDefault();
		if (note.trim() === "") return;
		decline.mutate(
			{ body: { id, note: note.trim() } },
			{ onSuccess: () => void navigate("/mentor-approvals") },
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{row ? row.name : t("mentorsApprovals")}
			</h1>
			{row ? (
				<p className="font-sans text-lg font-medium text-fg">
					{row.kind} · {row.weeklyContactCap}
				</p>
			) : null}
			{row ? (
				<Button
					type="button"
					disabled={approve.isPending}
					onClick={() =>
						approve.mutate(
							{ body: { id } },
							{ onSuccess: () => void navigate("/mentor-approvals") },
						)
					}
				>
					{t("mentorsApprove")}
				</Button>
			) : null}
			{row ? (
				<form
					onSubmit={declineWithNote}
					className="flex max-w-md flex-col gap-4"
				>
					<label className="flex flex-col gap-2">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("mentorsNote")}
						</span>
						<textarea
							value={note}
							onChange={(event) => setNote(event.target.value)}
							className="min-h-28 border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
						/>
					</label>
					{note.trim() !== "" ? (
						<Button type="submit" variant="quiet" disabled={decline.isPending}>
							{t("mentorsDecline")}
						</Button>
					) : null}
				</form>
			) : null}
		</section>
	);
}

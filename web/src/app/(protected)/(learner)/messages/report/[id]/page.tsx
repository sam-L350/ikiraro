import { type FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export default function ReportMessagePage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { id = "" } = useParams();
	const report = useEngineMutation("/messages/:id/report");
	const [note, setNote] = useState("");

	function submit(event: FormEvent) {
		event.preventDefault();
		if (note.trim() === "") return;
		report.mutate(
			{ body: { id, note: note.trim() } },
			{ onSuccess: () => void navigate("/messages") },
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("messagesReport")}
			</h1>
			<p className="font-sans text-lg font-medium text-fg">
				{t("messagesReportSentence")}
			</p>
			<form onSubmit={submit} className="flex max-w-md flex-col gap-4">
				<textarea
					value={note}
					onChange={(event) => setNote(event.target.value)}
					className="min-h-28 border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
				/>
				{note.trim() !== "" ? (
					<Button type="submit" disabled={report.isPending}>
						{t("messagesReportSend")}
					</Button>
				) : null}
			</form>
		</section>
	);
}

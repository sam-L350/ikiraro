import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export function SessionList() {
	const { t } = useI18n();
	const { logout } = useAuth();
	const navigate = useNavigate();
	const list = useEngine("/auth/sessions");
	const revoke = useEngineMutation("/auth/sessions/:id/revoke");
	const everywhere = useEngineMutation("/auth/sessions/revoke");
	const [confirmAll, setConfirmAll] = useState(false);

	async function leave() {
		await logout();
		navigate("/");
	}

	return (
		<section className="mt-2">
			<h2 className="font-sans text-2xl font-semibold text-fg">
				{t("sessionsTitle")}
			</h2>
			<ul className="mt-4 flex flex-col">
				{list.data?.sessions.map((row) => (
					<li
						key={row.id}
						className="flex items-center justify-between gap-4 border-t border-ink/15 py-4"
					>
						<span className="font-sans font-semibold text-fg">
							{row.current ? t("thisDevice") : t("otherSession")}
							{row.sharedDevice ? ` · ${t("sharedComputer")}` : ""}
						</span>
						<Button
							type="button"
							variant="quiet"
							disabled={revoke.isPending}
							onClick={() => {
								void revoke
									.mutateAsync({ query: { id: row.id } })
									.then(() => (row.current ? leave() : list.invalidate()));
							}}
						>
							{t("revokeSession")}
						</Button>
					</li>
				))}
			</ul>
			{confirmAll ? (
				<div className="mt-4 flex flex-col items-start gap-4">
					<p className="font-sans text-lg font-medium text-fg">
						{t("signOutEverywhereBody")}
					</p>
					<Button
						type="button"
						variant="danger"
						disabled={everywhere.isPending}
						onClick={() => {
							void everywhere.mutateAsync().then(() => leave());
						}}
					>
						{t("signOutEverywhere")}
					</Button>
				</div>
			) : (
				<Button
					type="button"
					variant="quiet"
					className="mt-2 px-0"
					onClick={() => setConfirmAll(true)}
				>
					{t("signOutEverywhere")}
				</Button>
			)}
		</section>
	);
}

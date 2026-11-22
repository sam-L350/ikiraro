import { Link } from "react-router";
import { SessionList } from "@/components/auth/session-list";
import { Button } from "@/components/ui/button";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export default function StaffHomePage() {
	const { t } = useI18n();
	const context = useEngine("/staff/context");
	const canAdd = context.data && context.data.mode !== "none";
	return (
		<section className="max-w-3xl">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg sm:text-5xl">
				{t("staffTitle")}
			</h1>
			<p className="mt-6 font-sans text-lg font-medium leading-relaxed text-fg">
				{t("staffBody")}
			</p>
			<div className="mt-8">
				<Button asChild variant="sticker">
					<Link to="/register/assisted">{t("registerLearner")}</Link>
				</Button>
			</div>
			{canAdd ? (
				<Link
					className="mt-4 inline-block font-sans text-sm font-semibold text-fg underline-offset-4 hover:underline"
					to="/staff/new"
				>
					{t("addStaff")}
				</Link>
			) : null}
			<SessionList />
		</section>
	);
}

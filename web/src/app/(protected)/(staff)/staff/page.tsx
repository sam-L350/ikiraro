import { Link } from "react-router";
import { SessionList } from "@/components/auth/session-list";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export default function StaffHomePage() {
	const { t } = useI18n();
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
			<SessionList />
		</section>
	);
}

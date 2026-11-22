import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export default function RegisterChoicePage() {
	const { t } = useI18n();
	return (
		<div className="flex flex-col items-start">
			<h1 className="font-sans text-3xl font-semibold text-balance text-fg">
				{t("registerTitle")}
			</h1>
			<p className="mt-4 font-sans text-lg font-medium text-fg">
				{t("registerSentence")}
			</p>
			<section className="mt-10 w-full">
				<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("selfOfferTitle")}
				</p>
				<ul className="mt-3 flex flex-col gap-2 font-sans text-base font-medium text-fg">
					<li>{t("selfCheckPhone")}</li>
					<li>{t("selfCheckConsent")}</li>
					<li>{t("selfCheckCode")}</li>
				</ul>
				<Card variant="ink" className="mt-4">
					<p className="font-sans text-2xl font-semibold text-balance">
						{t("selfOfferName")}
					</p>
					<div className="mt-6">
						<Button asChild variant="sticker">
							<Link to="/register/self">{t("startRegistration")}</Link>
						</Button>
					</div>
				</Card>
			</section>
			<section className="mt-10 w-full">
				<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("assistedOfferTitle")}
				</p>
				<ul className="mt-3 flex flex-col gap-2 font-sans text-base font-medium text-fg">
					<li>{t("assistedCheckTrainer")}</li>
					<li>{t("assistedCheckName")}</li>
					<li>{t("assistedCheckLater")}</li>
				</ul>
				<Card variant="quiet" className="mt-4">
					<p className="font-sans text-2xl font-semibold text-balance text-fg">
						{t("assistedOfferName")}
					</p>
					<div className="mt-6">
						<Button asChild variant="default">
							<Link to="/register/assisted">{t("registerLearner")}</Link>
						</Button>
					</div>
				</Card>
			</section>
			<Link
				className="mt-8 font-sans text-sm font-semibold text-fg underline-offset-4 hover:underline"
				to="/register/confirm"
			>
				{t("haveCode")}
			</Link>
		</div>
	);
}

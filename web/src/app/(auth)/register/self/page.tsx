import { Link } from "react-router";
import { RegistrationForm } from "@/components/auth/registration-form";
import { useI18n } from "@/lib/i18n";

export default function SelfRegistrationPage() {
	const { t } = useI18n();
	return (
		<div className="flex flex-col items-start">
			<Link
				className="font-sans text-sm font-semibold text-fg underline-offset-4 hover:underline"
				to="/register"
			>
				{t("registerTitle")}
			</Link>
			<h1 className="mt-4 font-sans text-3xl font-semibold text-balance text-fg">
				{t("selfOfferName")}
			</h1>
			<RegistrationForm mode="self" />
		</div>
	);
}

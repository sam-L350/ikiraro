import { Link, useSearchParams } from "react-router";
import { ActivationForm } from "@/components/auth/registration-form";
import { useI18n } from "@/lib/i18n";

export default function ConfirmRegistrationPage() {
	const { t } = useI18n();
	const [searchParams] = useSearchParams();
	const phone = searchParams.get("phone") ?? "";
	return (
		<div className="flex flex-col items-start">
			<Link
				className="font-sans text-sm font-semibold text-fg underline-offset-4 hover:underline"
				to="/register"
			>
				{t("registerTitle")}
			</Link>
			<h1 className="mt-4 font-sans text-3xl font-semibold text-balance text-fg">
				{t("activateAccount")}
			</h1>
			<ActivationForm phone={phone} />
		</div>
	);
}

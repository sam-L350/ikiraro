import { RegistrationForm } from "@/components/auth/registration-form";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function AssistedRegistrationPage() {
	const { t } = useI18n();
	const { user } = useAuth();
	const trainerName = user?.name ?? user?.email ?? "";

	return (
		<section className="max-w-xl">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg sm:text-5xl">
				{t("assistedOfferName")}
			</h1>
			<RegistrationForm mode="assisted" trainerName={trainerName} />
		</section>
	);
}

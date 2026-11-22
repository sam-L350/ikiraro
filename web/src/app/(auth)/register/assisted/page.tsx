import { Link, Navigate, useLocation } from "react-router";
import { RegistrationForm } from "@/components/auth/registration-form";
import { Spinner } from "@/components/spinner";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function AssistedRegistrationPage() {
	const { t } = useI18n();
	const { user, isLoading } = useAuth();
	const location = useLocation();

	if (isLoading) return <Spinner label="Resolving session" />;
	if (!user) {
		const redirect = encodeURIComponent(location.pathname);
		return <Navigate to={`/login?redirect=${redirect}`} replace />;
	}

	const trainerName = user.name ?? user.email;

	return (
		<div className="flex flex-col items-start">
			<Link
				className="font-sans text-sm font-semibold text-fg underline-offset-4 hover:underline"
				to="/register"
			>
				{t("registerTitle")}
			</Link>
			<h1 className="mt-4 font-sans text-3xl font-semibold text-balance text-fg">
				{t("assistedOfferName")}
			</h1>
			<RegistrationForm mode="assisted" trainerName={trainerName} />
		</div>
	);
}

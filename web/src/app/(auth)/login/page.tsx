import { Navigate, useSearchParams } from "react-router";
import { GoogleSignInButton } from "@/components/google-button";
import { Spinner } from "@/components/spinner";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

function safeRedirect(value: string | null): string {
	return value?.startsWith("/") && !value.startsWith("//") ? value : "/home";
}

export default function LoginPage() {
	const { user, isLoading } = useAuth();
	const [searchParams] = useSearchParams();
	const redirectTo = safeRedirect(searchParams.get("redirect"));
	const { t } = useI18n();

	if (isLoading) return <Spinner label="Resolving session" />;
	if (user) return <Navigate to={redirectTo} replace />;

	return (
		<div className="flex flex-col items-start">
			<h1 className="font-sans text-3xl font-semibold text-balance text-fg">
				{t("signIn")}
			</h1>
			<p className="mt-4 font-sans text-lg font-medium text-fg">
				{t("loginSentence")}
			</p>
			<div className="mt-8">
				<GoogleSignInButton redirectTo={redirectTo} label={t("signIn")} />
			</div>
		</div>
	);
}

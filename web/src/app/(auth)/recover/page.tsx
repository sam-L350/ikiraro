import { Link, Navigate, useSearchParams } from "react-router";
import { RecoveryForm } from "@/components/auth/recovery-form";
import { Spinner } from "@/components/spinner";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

function safeRedirect(value: string | null): string {
	return value?.startsWith("/") && !value.startsWith("//") ? value : "/home";
}

export default function RecoverPage() {
	const { user, isLoading } = useAuth();
	const [searchParams] = useSearchParams();
	const { t } = useI18n();
	if (isLoading) return <Spinner label="Resolving session" />;
	if (user)
		return <Navigate to={safeRedirect(searchParams.get("redirect"))} replace />;

	return (
		<div className="flex flex-col items-start">
			<Link
				className="font-sans text-sm font-semibold text-fg underline-offset-4 hover:underline"
				to="/login"
			>
				{t("signIn")}
			</Link>
			<h1 className="mt-4 font-sans text-3xl font-semibold text-balance text-fg">
				{t("recoverTitle")}
			</h1>
			<RecoveryForm redirectTo={safeRedirect(searchParams.get("redirect"))} />
		</div>
	);
}

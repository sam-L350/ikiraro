import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { LoginForm } from "@/components/auth/login-form";
import {
	previewRoleName,
	readPreviewRole,
	storePreviewRole,
} from "@/components/dev/preview-roles";
import {
	OpenPreviewButton,
	RolePreviewPanel,
	useRolePreview,
} from "@/components/dev/role-preview";
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
	const { open, setOpen, targetRef } = useRolePreview<HTMLHeadingElement>();
	const [pending, setPending] = useState<string | null>(() =>
		readPreviewRole(),
	);
	const pendingName = previewRoleName(pending);

	if (isLoading) return <Spinner label="Resolving session" />;
	if (user) return <Navigate to={redirectTo} replace />;

	return (
		<div className="flex flex-col items-start">
			<OpenPreviewButton onOpen={() => setOpen(true)} />
			<h1
				ref={targetRef}
				className="font-sans text-3xl font-semibold text-balance text-fg"
			>
				{t("signIn")}
			</h1>
			<LoginForm redirectTo={redirectTo} />
			<Link
				className="mt-6 font-sans text-sm font-semibold text-fg underline-offset-4 hover:underline"
				to="/register"
			>
				{t("createAccount")}
			</Link>
			{pendingName ? (
				<p className="mt-4 font-sans text-sm font-medium text-fg">
					This sign-in will enter as {pendingName}.
				</p>
			) : null}
			{open ? (
				<RolePreviewPanel
					selected={pending}
					onSelect={(role) => {
						storePreviewRole(role);
						setPending(role);
					}}
					onClose={() => setOpen(false)}
				/>
			) : null}
		</div>
	);
}

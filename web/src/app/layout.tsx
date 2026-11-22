import { Outlet } from "react-router";
import { DevRoleBridge } from "@/components/dev/role-preview";
import { RouteErrorBoundary } from "@/components/error-boundary";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";

export { RouteErrorBoundary as ErrorBoundary };

export default function RootLayout() {
	return (
		<I18nProvider>
			<AuthProvider>
				<DevRoleBridge />
				<Outlet />
			</AuthProvider>
		</I18nProvider>
	);
}

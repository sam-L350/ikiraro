import { Outlet } from "react-router";
import { RouteErrorBoundary } from "@/components/error-boundary";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";

export { RouteErrorBoundary as ErrorBoundary };

export default function RootLayout() {
	return (
		<I18nProvider>
			<AuthProvider>
				<Outlet />
			</AuthProvider>
		</I18nProvider>
	);
}

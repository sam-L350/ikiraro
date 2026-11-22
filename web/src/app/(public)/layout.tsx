import { Outlet } from "react-router";
import { PublicShell } from "@/components/shell/shells";

export default function PublicLayout() {
	return (
		<PublicShell>
			<Outlet />
		</PublicShell>
	);
}

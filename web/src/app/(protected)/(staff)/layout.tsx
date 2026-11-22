import { Outlet } from "react-router";
import { ProductShell } from "@/components/shell/shells";

export default function StaffLayout() {
	return (
		<ProductShell surface="staff">
			<Outlet />
		</ProductShell>
	);
}

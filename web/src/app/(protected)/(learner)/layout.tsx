import { Outlet } from "react-router";
import { ProductShell } from "@/components/shell/shells";

export default function LearnerLayout() {
	return (
		<ProductShell surface="learner">
			<Outlet />
		</ProductShell>
	);
}

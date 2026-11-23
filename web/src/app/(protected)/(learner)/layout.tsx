import { Outlet } from "react-router";
import { ProductShell } from "@/components/shell/shells";
import { UploadQueueNotice } from "@/lib/offline/upload-notice";

export default function LearnerLayout() {
	return (
		<ProductShell surface="learner">
			<UploadQueueNotice />
			<Outlet />
		</ProductShell>
	);
}

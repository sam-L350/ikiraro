import { Outlet } from "react-router";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { Wordmark } from "@/components/shell/wordmark";

export default function AuthLayout() {
	return (
		<div className="flex min-h-screen flex-col bg-canvas px-6 py-10">
			<div className="mx-auto flex w-full max-w-md items-center justify-between">
				<Wordmark />
				<LanguageSwitch />
			</div>
			<main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-16">
				<Outlet />
			</main>
		</div>
	);
}

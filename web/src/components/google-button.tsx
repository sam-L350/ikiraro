import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/lib/auth";

export function GoogleSignInButton({
	redirectTo = "/home",
	label = "Sign in",
}: {
	redirectTo?: string;
	label?: string;
	className?: string;
}) {
	return (
		<Button asChild variant="sticker">
			<a href={getLoginUrl(redirectTo)}>{label}</a>
		</Button>
	);
}

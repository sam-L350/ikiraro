import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
	const { theme, toggle } = useTheme();
	const isDark = theme === "dark";
	return (
		<button
			type="button"
			onClick={toggle}
			aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
			title={isDark ? "Light theme" : "Dark theme"}
			className={cn(
				"inline-flex size-11 items-center justify-center rounded-full text-fg hover:bg-canvas",
				className,
			)}
		>
			{isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
		</button>
	);
}

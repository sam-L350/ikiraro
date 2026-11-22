import { Link } from "react-router";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function Wordmark({
	className,
	inverted = false,
}: {
	className?: string;
	inverted?: boolean;
}) {
	const { t } = useI18n();
	return (
		<Link
			to="/"
			className={cn(
				"font-display text-2xl uppercase leading-none tracking-wide",
				inverted ? "text-ink-fg" : "text-fg",
				className,
			)}
		>
			{t("wordmark")}
		</Link>
	);
}

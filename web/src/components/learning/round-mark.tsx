import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function Frame({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 96 96"
			className={cn("size-20 shrink-0 text-ink", className)}
			fill="none"
		>
			{children}
		</svg>
	);
}

export function RoundMark({ className }: { className?: string }) {
	return (
		<Frame className={className}>
			<path
				d="M18 36 48 22l30 14v28L48 78 18 64V36Z"
				className="fill-yellow stroke-ink"
				strokeWidth="2"
			/>
			<path d="M18 36 48 50l30-14" className="stroke-ink" strokeWidth="2" />
			<path d="M48 50v28" className="stroke-ink" strokeWidth="2" />
		</Frame>
	);
}

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

export function InventoryMark({ className }: { className?: string }) {
	return (
		<Frame className={className}>
			<rect
				x="16"
				y="22"
				width="28"
				height="22"
				rx="4"
				className="fill-yellow stroke-ink"
				strokeWidth="2"
			/>
			<rect
				x="52"
				y="22"
				width="28"
				height="22"
				rx="4"
				className="fill-canvas stroke-ink"
				strokeWidth="2"
			/>
			<rect
				x="16"
				y="52"
				width="28"
				height="22"
				rx="4"
				className="fill-canvas stroke-ink"
				strokeWidth="2"
			/>
			<rect x="52" y="52" width="28" height="22" rx="4" className="fill-ink" />
		</Frame>
	);
}

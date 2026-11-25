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
			className={cn("size-16 text-ink", className)}
			fill="none"
		>
			{children}
		</svg>
	);
}

export function MapMark({ className }: { className?: string }) {
	return (
		<Frame className={className}>
			<path
				d="M28 22c8-10 32-10 40 2 6 10 2 22-6 30L48 74 34 54c-8-8-12-20-6-32Z"
				className="fill-yellow stroke-ink"
				strokeWidth="2"
			/>
			<circle cx="48" cy="40" r="6" className="fill-ink" />
		</Frame>
	);
}

export function LedgerMark({ className }: { className?: string }) {
	return (
		<Frame className={className}>
			<path
				d="M24 16h34l14 14v50H24V16Z"
				className="fill-surface stroke-ink"
				strokeWidth="2"
			/>
			<path d="M58 16v14h14" className="stroke-ink" strokeWidth="2" />
			<path
				d="M34 42h28M34 52h28M34 62h18"
				className="stroke-ink"
				strokeWidth="2"
			/>
			<rect x="34" y="70" width="16" height="6" className="fill-yellow" />
		</Frame>
	);
}

export function BoardMark({ className }: { className?: string }) {
	return (
		<Frame className={className}>
			<path d="M18 28h60v8H18z" className="fill-ink" />
			<path d="M18 44h44v8H18z" className="fill-ink" />
			<path
				d="M18 60h28v8H18z"
				className="fill-yellow stroke-ink"
				strokeWidth="2"
			/>
		</Frame>
	);
}

export function BadgeMark({ className }: { className?: string }) {
	return (
		<Frame className={className}>
			<circle
				cx="48"
				cy="40"
				r="22"
				className="fill-yellow stroke-ink"
				strokeWidth="2"
			/>
			<circle cx="48" cy="40" r="12" className="stroke-ink" strokeWidth="2" />
			<path d="M36 58 32 82l16-10 16 10-4-24" className="fill-ink" />
		</Frame>
	);
}

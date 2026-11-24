import type { ReactNode } from "react";

export function EmptyState({
	sentence,
	action,
}: {
	sentence: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex max-w-md flex-col items-start gap-6">
			<EmptyMark />
			<p className="font-sans text-lg font-medium text-fg">{sentence}</p>
			{action}
		</div>
	);
}

function EmptyMark() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 96 96"
			className="size-24 text-ink"
			fill="none"
		>
			<path
				d="M22 18h38l14 14v46H22V18Z"
				stroke="currentColor"
				strokeWidth="2"
			/>
			<path d="M60 18v14h14" stroke="currentColor" strokeWidth="2" />
			<path
				d="M32 44h32M32 56h32M32 68h20"
				stroke="currentColor"
				strokeWidth="2"
			/>
		</svg>
	);
}

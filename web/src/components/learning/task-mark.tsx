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

function PhotoMark() {
	return (
		<Frame>
			<rect
				x="16"
				y="24"
				width="64"
				height="50"
				rx="10"
				className="fill-yellow stroke-ink"
				strokeWidth="2"
			/>
			<path d="M34 24v-6h28v6" className="stroke-ink" strokeWidth="2" />
			<circle
				cx="48"
				cy="49"
				r="12"
				className="fill-canvas stroke-ink"
				strokeWidth="2"
			/>
			<circle cx="48" cy="49" r="5" className="fill-ink" />
		</Frame>
	);
}

function NoteMark() {
	return (
		<Frame>
			<path
				d="M24 16h34l14 14v50H24V16Z"
				className="fill-canvas stroke-ink"
				strokeWidth="2"
			/>
			<path d="M58 16v14h14" className="stroke-ink" strokeWidth="2" />
			<path
				d="M34 42h28M34 52h28M34 62h16"
				className="stroke-ink"
				strokeWidth="2"
			/>
			<path
				d="M62 68 74 56"
				className="stroke-yellow"
				strokeWidth="6"
				strokeLinecap="round"
			/>
		</Frame>
	);
}

function FileMark() {
	return (
		<Frame>
			<path
				d="M28 14h28l16 16v52H28V14Z"
				className="fill-surface stroke-ink"
				strokeWidth="2"
			/>
			<path d="M56 14v16h16" className="stroke-ink" strokeWidth="2" />
			<rect x="38" y="44" width="22" height="16" className="fill-yellow" />
		</Frame>
	);
}

function VoiceMark() {
	return (
		<Frame>
			<rect x="22" y="36" width="10" height="24" rx="3" className="fill-ink" />
			<rect
				x="40"
				y="22"
				width="10"
				height="52"
				rx="3"
				className="fill-yellow stroke-ink"
				strokeWidth="2"
			/>
			<rect x="58" y="30" width="10" height="36" rx="3" className="fill-ink" />
		</Frame>
	);
}

export function TaskMark({
	kind,
}: {
	kind: "photo" | "file" | "note" | "voice";
}) {
	switch (kind) {
		case "photo":
			return <PhotoMark />;
		case "file":
			return <FileMark />;
		case "note":
			return <NoteMark />;
		case "voice":
			return <VoiceMark />;
		default: {
			const unreachable: never = kind;
			return unreachable;
		}
	}
}

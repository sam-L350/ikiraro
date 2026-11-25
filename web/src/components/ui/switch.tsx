import { cn } from "@/lib/utils";

export function Switch({
	checked,
	disabled,
	label,
	onToggle,
}: {
	checked: boolean;
	disabled?: boolean;
	label: string;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			onClick={onToggle}
			className="inline-flex h-11 items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
		>
			<span
				className={cn(
					"relative h-6 w-11 rounded-full",
					checked ? "bg-ink" : "bg-line",
				)}
			>
				<span
					className={cn(
						"absolute top-0.5 size-5 rounded-full bg-canvas",
						checked ? "left-5" : "left-0.5",
					)}
				/>
			</span>
		</button>
	);
}

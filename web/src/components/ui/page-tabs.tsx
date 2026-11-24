export function PageTabs<T extends string>({
	label,
	value,
	onChange,
	tabs,
}: {
	label: string;
	value: T;
	onChange: (value: T) => void;
	tabs: readonly { value: T; label: string }[];
}) {
	return (
		<div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
			{tabs.map((tab) => (
				<button
					key={tab.value}
					type="button"
					role="tab"
					aria-selected={value === tab.value}
					className={
						value === tab.value
							? "inline-flex min-h-11 items-center rounded-full bg-ink px-4 font-sans text-sm font-semibold text-ink-fg"
							: "inline-flex min-h-11 items-center rounded-full px-4 font-sans text-sm font-semibold text-fg hover:bg-surface"
					}
					onClick={() => onChange(tab.value)}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}

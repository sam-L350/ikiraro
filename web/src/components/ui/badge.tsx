import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-meta text-xs font-semibold uppercase tracking-wide text-ink-fixed",
	{
		variants: {
			variant: {
				verified: "bg-green/20",
				pending: "bg-yellow",
				action: "bg-orange/18",
				info: "bg-sky/35",
				rejected: "bg-danger-soft text-danger",
				neutral: "bg-surface text-fg-muted",
				accent: "bg-green/20",
				warn: "bg-yellow",
				danger: "bg-danger-soft text-danger",
				ink: "bg-ink text-ink-fg",
				outline: "bg-surface text-fg-muted",
			},
		},
		defaultVariants: { variant: "neutral" },
	},
);

function Badge({
	className,
	variant,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return (
		<span className={cn(badgeVariants({ variant }), className)} {...props} />
	);
}

export { Badge, badgeVariants };

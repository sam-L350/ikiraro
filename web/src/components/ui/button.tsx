import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border border-transparent font-meta text-sm font-semibold uppercase tracking-wide outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				sticker:
					"h-11 rounded-full bg-yellow px-5 text-ink-fixed shadow-sticker transition-[transform,box-shadow] duration-150 ease-out hover:translate-x-px hover:translate-y-px hover:shadow-sticker-press active:translate-x-1 active:translate-y-1 active:shadow-none",
				ink: "h-11 rounded-full bg-green px-5 text-ink-fixed shadow-sticker-sm transition-[transform,box-shadow] duration-150 ease-out hover:translate-x-px hover:translate-y-px active:translate-x-1 active:translate-y-1 active:shadow-none",
				quiet:
					"h-11 rounded-full bg-transparent px-3 text-fg shadow-none hover:underline",
				destructive:
					"h-11 rounded-full bg-danger px-5 text-white shadow-sticker transition-[transform,box-shadow] duration-150 ease-out hover:translate-x-px hover:translate-y-px hover:shadow-sticker-press active:translate-x-1 active:translate-y-1 active:shadow-none",
				default:
					"h-11 rounded-full bg-ink px-5 text-ink-fg shadow-sticker-sm transition-[transform,box-shadow] duration-150 ease-out hover:translate-x-px hover:translate-y-px active:translate-x-1 active:translate-y-1 active:shadow-none",
				accent:
					"h-11 rounded-full bg-yellow px-5 text-ink-fixed shadow-sticker transition-[transform,box-shadow] duration-150 ease-out hover:translate-x-px hover:translate-y-px hover:shadow-sticker-press active:translate-x-1 active:translate-y-1 active:shadow-none",
				outline:
					"h-11 rounded-full bg-transparent px-5 text-fg shadow-none hover:underline",
				ghost:
					"h-11 rounded-full bg-transparent px-3 text-fg shadow-none hover:bg-surface",
				soft: "h-11 rounded-full bg-surface px-5 text-fg shadow-none",
				danger:
					"h-11 rounded-full bg-danger px-5 text-white shadow-sticker transition-[transform,box-shadow] duration-150 ease-out active:translate-x-1 active:translate-y-1 active:shadow-none",
				link: "h-11 rounded-full bg-transparent px-0 text-fg shadow-none underline-offset-4 hover:underline",
			},
			size: {
				default: "",
				sm: "h-11 px-4 text-xs",
				lg: "h-11 px-5",
				icon: "size-11 rounded-full px-0",
				"icon-sm": "size-11 rounded-full px-0",
			},
		},
		defaultVariants: {
			variant: "sticker",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "sticker",
	size = "default",
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";
	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };

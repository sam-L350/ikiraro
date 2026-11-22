import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const cardVariants = cva("text-fg", {
	variants: {
		variant: {
			quiet: "rounded-[20px] bg-surface p-6 text-fg sm:p-8",
			poster: "rounded-[20px] p-8 text-ink-fixed sm:p-10",
			ink: "rounded-[28px] bg-ink p-8 text-ink-fg sm:p-10",
			default: "rounded-[20px] bg-surface text-fg",
		},
		tone: {
			none: "",
			yellow: "bg-yellow",
			orange: "bg-orange",
			sky: "bg-sky",
			green: "bg-green",
			magenta: "bg-magenta",
			taupe: "bg-taupe",
		},
	},
	defaultVariants: {
		variant: "default",
		tone: "none",
	},
});

function Card({
	className,
	variant,
	tone,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
	return (
		<div
			data-slot="card"
			className={cn(cardVariants({ variant, tone }), className)}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-header"
			className={cn("flex flex-col gap-2 px-6 pt-6", className)}
			{...props}
		/>
	);
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
	return (
		<h3
			data-slot="card-title"
			className={cn(
				"font-sans text-2xl font-semibold leading-tight text-balance",
				className,
			)}
			{...props}
		/>
	);
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="card-description"
			className={cn("font-sans text-base font-medium text-fg-muted", className)}
			{...props}
		/>
	);
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-content"
			className={cn("px-6 py-6", className)}
			{...props}
		/>
	);
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-footer"
			className={cn(
				"flex items-center gap-3 px-6 py-4 text-sm text-fg-muted",
				className,
			)}
			{...props}
		/>
	);
}

export {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
	cardVariants,
};

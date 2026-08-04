import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./lib.js";

const buttonVariants = cva("inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-[background-color,color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px", {
  variants: {
    variant: {
      primary: "bg-violet-600 text-white shadow-[0_10px_25px_-12px_rgba(124,58,237,.8)] hover:bg-violet-700",
      secondary: "border border-zinc-200 bg-white text-zinc-800 shadow-sm hover:bg-zinc-50",
      ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
      dark: "bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/15",
      danger: "bg-rose-600 text-white hover:bg-rose-700",
    },
    size: { sm: "min-h-9 rounded-lg px-3 text-xs", md: "min-h-10", lg: "min-h-12 px-5" },
  },
  defaultVariants: { variant: "primary", size: "md" },
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean; }
export function Button({ asChild, className, variant, size, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 shrink-0", {
  variants: { variant: { default: "bg-primary text-white hover:bg-primary/90", outline: "border border-border bg-white hover:bg-secondary", ghost: "hover:bg-secondary text-muted-foreground", destructive: "text-red-700 hover:bg-red-50" }, size: { default: "h-10 px-4", sm: "h-9 px-3 text-xs", icon: "h-10 w-10", lg: "h-12 px-6" } },
  defaultVariants: { variant: "default", size: "default" },
});
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

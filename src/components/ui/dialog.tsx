"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-stone-950/25 backdrop-blur-[3px]" /><DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-white p-7 shadow-xl", className)} {...props}>
    {children}<DialogPrimitive.Close aria-label="Close settings" className="absolute right-4 top-4 rounded-lg p-2 text-muted-foreground hover:bg-secondary"><X size={18} /></DialogPrimitive.Close>
  </DialogPrimitive.Content></DialogPrimitive.Portal>;
}

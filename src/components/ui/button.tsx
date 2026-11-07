import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { toast } from "sonner";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap uix-button rounded-xl text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        gold: "bg-gold text-gold-foreground shadow-gold hover:bg-gold/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-11 px-4 py-2",
        sm: "min-h-11 rounded-xl px-3 text-sm",
        lg: "min-h-12 rounded-xl px-8",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner, sets aria-busy and blocks repeat presses. */
  loading?: boolean;
  /** Label shown while loading, e.g. "Saving your expense…". */
  loadingText?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, loadingText, onClick, disabled, children, ...props }, ref) => {
    // Async click handlers (returning a promise) get automatic in-flight feedback and single-flight protection.
    const [auto, setAuto] = React.useState(false);
    const busy = !!loading || auto;
    const handle = onClick && ((e: React.MouseEvent<HTMLButtonElement>) => {
      if (busy) { e.preventDefault(); return; }
      const r = (onClick as (e: React.MouseEvent<HTMLButtonElement>) => unknown)(e);
      if (r && typeof (r as Promise<unknown>).then === "function") {
        setAuto(true);
        // A failed action must never look like "no response": surface the reason unless the handler already did.
        (r as Promise<unknown>).finally(() => setAuto(false)).catch((err: unknown) => {
          if (err && typeof err === "object" && (err as { shown?: boolean }).shown) return;
          toast.error(err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.");
        });
      }
    });
    if (asChild) {
      return <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} onClick={handle} aria-disabled={disabled || undefined} {...props}>{children}</Slot>;
    }
    return (
      <button className={cn(buttonVariants({ variant, size, className }), busy && "cursor-progress")} ref={ref} onClick={handle} disabled={disabled || busy} aria-busy={busy || undefined} {...props}>
        {busy && <Spinner />}
        {busy && size === "icon" ? null : busy && loadingText ? loadingText : children}
      </button>
    );
  },
);
Button.displayName = "Button";

/** Theme-coloured spinner; stays still for people who prefer reduced motion. */
export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block size-4 shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin", className)} />;
}

export { Button, buttonVariants };

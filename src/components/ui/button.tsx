/* eslint-disable react-refresh/only-export-components -- variant partagé par AlertDialog */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base : touch target 44px min, icône fixe 16×16 (size-4) — ne jamais changer la taille d'icône selon le contexte
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary — action principale (valider, créer, confirmer) : toujours orange
        default:
          "rounded-2xl bg-brand-accent text-brand-accent-foreground shadow-card hover:brightness-95 active:scale-[0.98]",
        // Destructive — action irréversible : rouge, toujours précédé d'une confirmation
        destructive:
          "rounded-2xl bg-destructive text-destructive-foreground hover:brightness-90 active:scale-[0.98]",
        // Outline — action secondaire (retour, filtrer)
        outline:
          "rounded-2xl border border-border bg-card text-foreground hover:bg-secondary hover:border-foreground/20",
        // Ghost — annuler, fermer
        ghost:
          "rounded-2xl border border-border text-muted-foreground hover:text-foreground hover:border-border-strong",
        // Secondary — neutre avec fond (rare, préférer outline)
        secondary: "rounded-2xl bg-secondary text-secondary-foreground hover:bg-secondary/80",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Taille unique : min-height 44px (touch target)
        default: "min-h-11 px-5 py-2.5 text-[13px]",
        // sm : actions intégrées dans des cartes ou listes
        sm: "min-h-9 px-3.5 py-2 text-[12px] rounded-xl [&_svg]:size-3.5",
        // lg : CTA pleine largeur dans les sheets / pages
        lg: "min-h-12 px-6 py-3 text-[14px]",
        icon: "min-h-11 w-11 rounded-2xl",
        "icon-sm": "min-h-9 w-9 rounded-xl [&_svg]:size-3.5",
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
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled ?? isLoading}
        {...props}
      >
        {isLoading ? <Loader2 className="animate-spin" /> : null}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

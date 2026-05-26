"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, checked, ...props }, ref) => (
    <label className="inline-flex cursor-pointer items-center gap-2 select-none">
      <span className="relative inline-flex h-5 w-5 items-center justify-center">
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          className={cn(
            "peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-input bg-background shadow-sm transition-colors checked:border-accent checked:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            className,
          )}
          {...props}
        />
        <Check className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </label>
  ),
);
Checkbox.displayName = "Checkbox";

export { Checkbox };

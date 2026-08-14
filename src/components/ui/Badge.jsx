import React from "react";
import { cn } from "../../lib/utils";

function Badge({ className, variant = "default", ...props }) {
  const variants = {
    default: "border-transparent bg-blue-600 text-white hover:bg-blue-700",
    secondary: "border-transparent bg-neutral-800 text-neutral-100 hover:bg-neutral-700",
    destructive: "border-transparent bg-red-900/50 text-red-100 hover:bg-red-900/80",
    outline: "text-neutral-foreground",
    success: "border-transparent bg-emerald-900/50 text-emerald-100 hover:bg-emerald-900/80",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };

import React from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

export const Button = React.forwardRef(({ className, variant = "default", size = "default", children, ...props }, ref) => {
  const variants = {
    default: "bg-white text-black hover:bg-neutral-200",
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    outline: "border border-neutral-700 text-white hover:bg-neutral-800",
    ghost: "text-neutral-300 hover:text-white hover:bg-neutral-800",
  };

  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3",
    lg: "h-11 rounded-md px-8",
    icon: "h-10 w-10",
  };

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
});
Button.displayName = "Button";

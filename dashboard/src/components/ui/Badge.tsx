import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "destructive" | "outline"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variantClasses = {
    default: "bg-primary/10 text-primary border-transparent",
    success: "bg-success/15 text-success border-transparent hover:bg-success/20",
    warning: "bg-warning/15 text-warning border-transparent hover:bg-warning/20",
    destructive: "bg-destructive/15 text-destructive border-transparent hover:bg-destructive/20",
    outline: "text-foreground border-border",
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }

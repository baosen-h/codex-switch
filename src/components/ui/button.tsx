import React from "react";
import { cn } from "./lib";

type ButtonVariant = "default" | "ghost";
type ButtonSize = "default" | "icon";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "prompt-kit-button",
        `prompt-kit-button-${variant}`,
        `prompt-kit-button-${size}`,
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = "Button";

import React from "react";
import { cn } from "./lib";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(className)} {...props} />
  ),
);

Textarea.displayName = "Textarea";

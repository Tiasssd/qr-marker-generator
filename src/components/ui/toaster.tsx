"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { AlertTriangle, Check } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex w-full items-start gap-3">
              {variant === "success" && (
                <span
                  className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-400"
                  aria-hidden="true"
                >
                  <Check className="size-3.5" strokeWidth={2.5} />
                </span>
              )}
              {variant === "destructive" && (
                <span
                  className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/15 text-white"
                  aria-hidden="true"
                >
                  <AlertTriangle className="size-3.5" strokeWidth={2.5} />
                </span>
              )}
              <div className="grid min-w-0 gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}

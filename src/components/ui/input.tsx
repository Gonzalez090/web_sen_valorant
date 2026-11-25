import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'block w-full rounded-xl border border-line-strong bg-bg px-4 py-3 text-fg transition-colors duration-150 placeholder:text-muted/60 hover:border-fg/25 focus-visible:border-accent aria-invalid:border-warn',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

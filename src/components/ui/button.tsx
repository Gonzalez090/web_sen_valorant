import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,border-color,color,filter,transform] duration-150 select-none active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100',
  {
    variants: {
      variant: {
        // Dark text on the accent: white on #FF4655 is only 3.3:1, below WCAG AA.
        primary: 'bg-accent text-on-accent hover:brightness-110',
        secondary: 'border border-line-strong bg-transparent text-fg hover:bg-fg/5',
        ghost: 'bg-transparent text-muted hover:bg-fg/5 hover:text-fg',
      },
      size: {
        lg: 'h-14 px-6 text-base',
        md: 'h-11 px-4 text-sm',
        sm: 'h-9 px-3 text-sm',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
))
Button.displayName = 'Button'

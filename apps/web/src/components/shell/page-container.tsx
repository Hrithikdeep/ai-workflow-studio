import { cn } from '@/lib/utils'

interface PageContainerProps {
  children: React.ReactNode
  className?: string
  size?: 'narrow' | 'medium' | 'wide' | 'full'
}

const containerSizes = {
  narrow: 'max-w-4xl',
  medium: 'max-w-6xl',
  wide: 'max-w-[1440px]',
  full: 'max-w-full',
}

export function PageContainer({
  children,
  className,
  size = 'wide',
}: PageContainerProps) {
  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-6">
      <div
        className={cn(
          'mx-auto flex w-full max-w-[1480px] flex-col gap-5',
          containerSizes[size],
          className
        )}
      >
        {children}
      </div>
    </main>
  )
}
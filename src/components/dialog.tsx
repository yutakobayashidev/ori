import { cn } from 'cn'
import { Icon } from './icon'
import { Button } from './ui/button'
import {
  DialogClose,
  DialogContent,
  DialogHeader,
  Dialog as DialogRoot,
  DialogTitle,
} from './ui/dialog'

export function Dialog({
  title,
  onClose,
  children,
  className,
}: {
  title: string
  className?: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn('max-h-[calc(100dvh-2rem)] overflow-y-auto', className)}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-2 top-2"
              aria-label="閉じる"
            />
          }
        >
          <Icon name="close" />
        </DialogClose>
        {children}
      </DialogContent>
    </DialogRoot>
  )
}

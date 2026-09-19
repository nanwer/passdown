'use client';
import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';
export function Dialog({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
  onCloseAutoFocus,
  closeDisabled = false,
}: {
  trigger: ReactElement;
  title: string;
  description: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: ComponentPropsWithoutRef<typeof Primitive.Content>['onCloseAutoFocus'];
  closeDisabled?: boolean;
}) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Trigger asChild>{trigger}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Overlay className="dialog-overlay" />
        <Primitive.Content className="dialog-content" onCloseAutoFocus={onCloseAutoFocus}>
          <Primitive.Title className="dialog-title">{title}</Primitive.Title>
          <Primitive.Description className="dialog-description">
            {description}
          </Primitive.Description>
          <div className="dialog-body">{children}</div>
          <Primitive.Close
            className="icon-button dialog-close"
            aria-label="Close dialog"
            disabled={closeDisabled}
          >
            <X size={20} />
          </Primitive.Close>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}

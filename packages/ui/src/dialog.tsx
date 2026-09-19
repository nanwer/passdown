'use client';
import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  createContext,
  useContext,
  type CSSProperties,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from 'react';

// Portals preserve React context, so each backdrop can cover its parent dialog.
const DialogDepth = createContext(0);

export function Dialog({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
  onCloseAutoFocus,
  closeDisabled = false,
  size = 'standard',
}: {
  trigger: ReactElement;
  title: string;
  description: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: ComponentPropsWithoutRef<typeof Primitive.Content>['onCloseAutoFocus'];
  closeDisabled?: boolean;
  size?: 'standard' | 'wide';
}) {
  const depth = useContext(DialogDepth);
  const layer = { '--dialog-depth': depth } as CSSProperties;
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Trigger asChild>{trigger}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Overlay className="dialog-overlay" style={layer} />
        <Primitive.Content
          className="dialog-content"
          style={layer}
          data-size={size}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <Primitive.Title className="dialog-title">{title}</Primitive.Title>
          <Primitive.Description className="dialog-description">
            {description}
          </Primitive.Description>
          <DialogDepth.Provider value={depth + 1}>
            <div className="dialog-body">{children}</div>
          </DialogDepth.Provider>
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

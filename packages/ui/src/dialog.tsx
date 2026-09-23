'use client';
import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { iconButton } from './primitives';
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
  /** Omitted when the dialog is opened by its `open` prop rather than a control. */
  trigger?: ReactElement;
  title: string;
  description: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: ComponentPropsWithoutRef<typeof Primitive.Content>['onCloseAutoFocus'];
  closeDisabled?: boolean;
  /** A sheet slides in from the side and leaves what it was opened from in place. */
  size?: 'standard' | 'wide' | 'sheet';
}) {
  const depth = useContext(DialogDepth);
  const layer = { '--dialog-depth': depth } as CSSProperties;
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Primitive.Trigger asChild>{trigger}</Primitive.Trigger>}
      <Primitive.Portal>
        <Primitive.Overlay
          className="dialog-overlay fixed inset-0 z-[calc(50_+_var(--dialog-depth,0)_*_2)] bg-[var(--gp-component-dialog-backdrop)] [backdrop-filter:blur(4px)] forced-colors:[background:Canvas] forced-colors:opacity-[0.65]"
          style={layer}
        />
        <Primitive.Content
          className="dialog-content fixed top-[50%] left-[50%] z-[calc(51_+_var(--dialog-depth,0)_*_2)] max-h-[calc(100dvh_-_32px)] w-[min(calc(var(--dialog-width)_+_var(--dialog-depth,0)_*_var(--gp-component-dialog-depth-width)),calc(100%_-_32px))] [transform:translate(-50%,-50%)] overflow-auto rounded-dialog border border-solid border-line bg-raised p-10 [--dialog-width:var(--gp-component-dialog-width-standard)] [box-shadow:var(--gp-component-dialog-shadow)] forced-colors:border-[CanvasText] max-[470px]:px-6 max-[470px]:py-8 data-[size=wide]:[--dialog-width:var(--gp-component-dialog-width-wide)] [&:has(.structured-form)]:max-h-[min(90dvh,1000px)] [&:has(.structured-form)]:overflow-y-auto [&:has(.structured-picker-content)]:max-h-[min(90dvh,1000px)] [&:has(.structured-picker-content)]:overflow-y-auto data-[size=sheet]:top-0 data-[size=sheet]:right-0 data-[size=sheet]:bottom-0 data-[size=sheet]:left-auto data-[size=sheet]:h-[100dvh] data-[size=sheet]:max-h-[none] data-[size=sheet]:w-[min(600px,100%)] data-[size=sheet]:[transform:none] data-[size=sheet]:[border-end-end-radius:0] data-[size=sheet]:[border-start-end-radius:0] rtl:data-[size=sheet]:right-auto rtl:data-[size=sheet]:left-0"
          style={layer}
          data-size={size}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <Primitive.Title className="me-[15px] text-[22px] font-semibold tracking-[-0.7px]">
            {title}
          </Primitive.Title>
          <Primitive.Description className="mt-3.5 text-[13px] text-muted">
            {description}
          </Primitive.Description>
          <DialogDepth.Provider value={depth + 1}>
            <div className="mt-5.5 text-[14px]">{children}</div>
          </DialogDepth.Provider>
          <Primitive.Close
            className={`${iconButton} absolute end-[7px] top-[7px]`}
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

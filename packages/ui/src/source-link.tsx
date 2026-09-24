'use client';
import { createContext, useContext, type ReactNode } from 'react';
const SourceContext = createContext<string | null>(null);
export function SourceLinkProvider({ href, children }: { href: string; children: ReactNode }) {
  return <SourceContext.Provider value={href}>{children}</SourceContext.Provider>;
}
export function SourceCodeLink({ className }: { className?: string }) {
  const href = useContext(SourceContext);
  return href ? (
    <a href={href} className={className}>
      Source code
    </a>
  ) : null;
}

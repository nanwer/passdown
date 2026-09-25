import type { ErrorMessage } from './transport';
import * as X from './studio-styles';

/**
 * The short reference an operator finds a failure by. It sits inside the
 * message's own text, so it is announced with it, and one click selects the
 * whole reference for copying.
 */
export function ErrorReference({ reference }: { reference: string }) {
  return (
    <span className="mt-1 block text-[13px]">
      Reference: <code className="font-mono select-all">{reference}</code>
    </span>
  );
}

/** The message alone, for a notice that adds its own words after it. */
export function messageOf(error: ErrorMessage) {
  return typeof error === 'string' ? error : error.message;
}
export function referenceOf(error: ErrorMessage) {
  return typeof error === 'string' ? undefined : error.reference;
}

/**
 * A failure message. A failure the person cannot fix themselves also shows
 * the reference to give the operator.
 */
export function ErrorNotice({ error }: { error: ErrorMessage }) {
  const reference = referenceOf(error);
  return (
    <div className={X.errorNotice} role="alert">
      {messageOf(error)}
      {reference && (
        <>
          {' '}
          <ErrorReference reference={reference} />
        </>
      )}
    </div>
  );
}

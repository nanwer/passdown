'use client';

import { useCallback, useEffect, useRef } from 'react';

/** A completed server mutation must not select a result from a dismissed form. */
export function useFormRequest() {
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current += 1;
  }, []);
  useEffect(() => invalidate, [invalidate]);

  const begin = useCallback(() => {
    const requestGeneration = ++generation.current;
    return () => generation.current === requestGeneration;
  }, []);

  return { begin, invalidate };
}

'use client';
import { useId, type InputHTMLAttributes } from 'react';
export function FormField({
  label,
  description,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  description?: string;
  error?: string;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy =
    [description && `${fieldId}-description`, error && `${fieldId}-error`]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className="form-field">
      <label htmlFor={fieldId}>{label}</label>
      {description && (
        <p id={`${fieldId}-description`} className="field-description">
          {description}
        </p>
      )}
      <input
        {...props}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error && (
        <p id={`${fieldId}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

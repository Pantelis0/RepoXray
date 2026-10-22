import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { formatRepoRef, parseRepoUrl, type RepoRef } from '../lib/parseRepoUrl';

export interface UrlFormProps {
  /** True while a repo is being checked; disables submitting again. */
  busy: boolean;
  /** Called only with a validated repo. Raw input never leaves this component. */
  onAnalyse: (ref: RepoRef) => void;
  /** Called when the user edits the input, so stale results can be cleared. */
  onEdit?: () => void;
}

interface FieldError {
  message: string;
  suggestion?: string;
}

export function UrlForm({ busy, onAnalyse, onEdit }: UrlFormProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<FieldError | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const errorId = useId();

  // Live preview of what will be analysed, shown while the input is valid.
  const preview = useMemo(() => {
    if (!value.trim()) return null;
    const result = parseRepoUrl(value);
    return result.ok ? formatRepoRef(result.value) : null;
  }, [value]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const result = parseRepoUrl(value);
    if (!result.ok) {
      onEdit?.();
      setError({ message: result.error, suggestion: result.suggestion });
      inputRef.current?.focus();
      return;
    }
    setError(null);
    onAnalyse(result.value);
  }

  function applySuggestion(suggestion: string) {
    setValue(suggestion);
    setError(null);
    onEdit?.();
    inputRef.current?.focus();
  }

  return (
    <form className="url-form" onSubmit={handleSubmit} noValidate aria-busy={busy}>
      <div className="url-form__row">
        <label htmlFor="repo-url" className="visually-hidden">
          Public GitHub repository URL
        </label>
        <input
          ref={inputRef}
          id="repo-url"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="https://github.com/owner/repo"
          value={value}
          maxLength={500}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hintId}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
            onEdit?.();
          }}
        />
        <button type="submit" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" /> Checking…
            </>
          ) : (
            'Analyse'
          )}
        </button>
      </div>

      {error ? (
        <p id={errorId} className="field-error" role="alert">
          {error.message}
          {error.suggestion && (
            <>
              {' '}
              <button
                type="button"
                className="link-button"
                onClick={() => applySuggestion(error.suggestion!)}
              >
                Use {error.suggestion}
              </button>
            </>
          )}
        </p>
      ) : (
        <p id={hintId} className="field-hint">
          {preview ? (
            <>
              <span aria-hidden="true">→ </span>
              <span className="visually-hidden">Will analyse </span>
              <code>{preview}</code>
            </>
          ) : (
            <>
              Try <code>facebook/react</code> or <code>https://github.com/facebook/react</code>
            </>
          )}
        </p>
      )}
    </form>
  );
}

import { useState, type FormEvent } from 'react';

export interface UrlFormProps {
  onSubmit: (url: string) => void;
}

export function UrlForm({ onSubmit }: UrlFormProps) {
  const [url, setUrl] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(url.trim());
  }

  return (
    <form className="url-form" onSubmit={handleSubmit}>
      <label htmlFor="repo-url" className="visually-hidden">
        Public GitHub repository URL
      </label>
      <input
        id="repo-url"
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="https://github.com/owner/repo"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <button type="submit">Analyse</button>
    </form>
  );
}

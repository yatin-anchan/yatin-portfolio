
import { useEffect, useState } from 'react';
import './css/Header.css';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';

  const savedTheme = localStorage.getItem('portfolio-theme');

  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export default function Header() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('portfolio-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => current === 'light' ? 'dark' : 'light');
  };

  return (
    <header className="site-header">
      <a
        className="site-header__logo"
        href="#home"
        aria-label="Yatin Anchan home"
      >
        <svg viewBox="0 0 48 32" aria-hidden="true">
          <path
            d="M2 30 17 6l8 12 5-7 16 19Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <path
            d="m13 14 4-6 4 6-4-2Zm19 3 3-4 4 6-4-2Z"
            fill="currentColor"
          />
        </svg>
      </a>

      <div className="site-header__actions">
        <button
          type="button"
          className="site-header__theme"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M20.2 15.4A8.5 8.5 0 0 1 8.6 3.8 8.5 8.5 0 1 0 20.2 15.4Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle
                cx="12"
                cy="12"
                r="4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}

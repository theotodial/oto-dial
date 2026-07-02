import { useEffect, useId, useRef, useState } from 'react';
import { ALL_COUNTRIES, filterCountries, getCountryByCode } from '../utils/countryList';
import CountryFlag from './CountryFlag';

const triggerClass =
  'w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-left flex items-center gap-3';

function CountrySelect({ value, onChange, placeholder = 'Search and select country…', disabled = false }) {
  const listId = useId();
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = getCountryByCode(value);
  const options = filterCountries(query);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const pick = (code) => {
    onChange(code);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`${triggerClass} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
      >
        {selected ? (
          <>
            <CountryFlag code={selected.code} />
            <span className="flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">{placeholder}</span>
        )}
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl overflow-hidden"
        >
          <div className="p-2 border-b border-gray-100 dark:border-slate-700">
            <div className="relative">
              <svg
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by country name or code…"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoComplete="off"
              />
            </div>
            <p className="mt-1.5 px-1 text-xs text-gray-400 dark:text-gray-500">
              {options.length} of {ALL_COUNTRIES.length} countries
            </p>
          </div>

          <ul className="max-h-56 overflow-y-auto py-1">
            {options.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No countries match &ldquo;{query}&rdquo;
              </li>
            ) : (
              options.map((country) => {
                const isSelected = country.code === selected?.code;
                return (
                  <li key={country.code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => pick(country.code)}
                      className={`w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200'
                          : 'text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-700/80'
                      }`}
                    >
                      <CountryFlag code={country.code} />
                      <span className="flex-1 truncate">{country.name}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default CountrySelect;

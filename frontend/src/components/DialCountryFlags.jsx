import CountryFlag from './CountryFlag';

function DialCountryFlags({
  flagCodes,
  className = 'w-5 h-3.5 object-cover rounded-[2px] shadow-sm border border-gray-200/70 dark:border-slate-600 flex-shrink-0 bg-gray-100 dark:bg-slate-700',
}) {
  const codes = Array.isArray(flagCodes) ? flagCodes : [];
  if (!codes.length) return null;

  return (
    <span className="inline-flex items-center gap-0.5 flex-shrink-0" aria-hidden>
      {codes.map((code) => (
        <CountryFlag key={code} code={code} className={className} />
      ))}
    </span>
  );
}

export default DialCountryFlags;

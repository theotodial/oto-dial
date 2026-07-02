/** PNG flag URL (flagcdn) — reliable on Windows where emoji flags show as "US", "AF", etc. */
export function countryFlagUrl(code, width = 40) {
  const c = String(code || '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(c)) return '';
  return `https://flagcdn.com/w${width}/${c}.png`;
}

function CountryFlag({
  code,
  className = 'w-7 h-5 object-cover rounded-[3px] shadow-sm border border-gray-200/70 dark:border-slate-600 flex-shrink-0 bg-gray-100 dark:bg-slate-700',
}) {
  const src = countryFlagUrl(code, 40);
  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      width={28}
      height={20}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}

export default CountryFlag;

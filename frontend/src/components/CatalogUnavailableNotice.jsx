import PrefetchLink from './PrefetchLink';
import {
  UNAVAILABLE_SUPPORT_MESSAGE,
  SUPPORT_UNAVAILABLE_PATH,
} from '../utils/catalogAvailability';

function CatalogUnavailableNotice({ className = '' }) {
  return (
    <p
      className={`text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/35 border border-amber-200/80 dark:border-amber-700/40 rounded-lg px-3 py-2 leading-relaxed ${className}`}
    >
      {UNAVAILABLE_SUPPORT_MESSAGE}{' '}
      <PrefetchLink to={SUPPORT_UNAVAILABLE_PATH} className="font-semibold underline hover:no-underline">
        Contact support
      </PrefetchLink>
    </p>
  );
}

export default CatalogUnavailableNotice;

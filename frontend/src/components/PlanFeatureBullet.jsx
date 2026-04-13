import { normalizePlanFeature } from '../utils/planDisplay';

/**
 * @param {{ text?: string, included?: boolean } | string} feature
 * @param {'homepage' | 'billing'} variant
 */
export default function PlanFeatureBullet({ feature, variant = 'homepage' }) {
  const { text, included } = normalizePlanFeature(feature);

  if (variant === 'billing') {
    return (
      <li className="flex items-start gap-2">
        <span
          className={`mt-[3px] h-3 w-3 rounded-full flex items-center justify-center text-[9px] font-bold ${
            included
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300'
              : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
          }`}
          aria-hidden
        >
          {included ? '✓' : '✕'}
        </span>
        <span>{text}</span>
      </li>
    );
  }

  return (
    <li className="flex items-start">
      {included ? (
        <svg
          className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 mr-3 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 mr-3 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      )}
      <span className="text-gray-700 dark:text-gray-300">{text}</span>
    </li>
  );
}

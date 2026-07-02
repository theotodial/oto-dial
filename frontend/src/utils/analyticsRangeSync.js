const RANGE_LABELS = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '14d': 'Last 14 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  this_month: 'This month',
  prev_month: 'Previous month',
  this_quarter: 'This quarter',
  this_year: 'This year',
  last_year: 'Last year',
  all: 'All time',
  custom: 'Custom range'
};

/**
 * Map Historical Reports filter to live intelligence API params so both
 * sections use the same date boundaries and visitor definitions.
 */
export function historicalFiltersToLiveParams(filters = {}) {
  const tzOffset = -new Date().getTimezoneOffset();
  const { range, customStart, customEnd } = filters;

  if (range && range !== 'custom') {
    return {
      range,
      tzOffset,
      window: null,
      startDate: null,
      endDate: null,
      label: RANGE_LABELS[range] || range
    };
  }

  return {
    range: 'custom',
    tzOffset,
    window: 'custom',
    startDate: customStart ? `${customStart}T00:00:00.000Z` : null,
    endDate: customEnd ? `${customEnd}T23:59:59.999Z` : null,
    label: RANGE_LABELS.custom
  };
}

export function liveSnapshotMatchesParams(snapshot, params) {
  if (!snapshot?.timeframe) return false;
  const tf = snapshot.timeframe;
  if (params.range && params.range !== 'custom') {
    return tf.window === params.range;
  }
  if (params.startDate && params.endDate) {
    const snapStart = new Date(tf.start).getTime();
    const snapEnd = new Date(tf.end).getTime();
    const paramStart = new Date(params.startDate).getTime();
    const paramEnd = new Date(params.endDate).getTime();
    return Math.abs(snapStart - paramStart) < 1000 && Math.abs(snapEnd - paramEnd) < 1000;
  }
  return tf.window === (params.window || '15m');
}

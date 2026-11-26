import { useMemo } from 'react';
import { computeAnalytics } from '../core/analytics';

// Time-based reading statistics for the Analytics tab. The calculation
// lives in core/analytics.js (with tests).
export function useAnalytics(works, statuses, readingLog) {
  return useMemo(() => computeAnalytics(works, statuses, readingLog), [works, statuses, readingLog]);
}

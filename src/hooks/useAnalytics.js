import { useMemo } from 'react';

/**
 * useAnalytics — derives time-based reading statistics from works, statuses,
 * and reading_log data. Designed to work even when reading_log is empty by
 * falling back to reading_status timestamps (completed_at, started_at).
 *
 * Returns everything the AnalyticsView and ReadingWrapped components need.
 */
export function useAnalytics(works, statuses, readingLog) {

  return useMemo(() => {
    const now = new Date();

    // --- Helper: group items into time buckets ---
    function bucketByWeek(items, dateKey) {
      const buckets = {};
      items.forEach(item => {
        const d = new Date(item[dateKey]);
        if (isNaN(d)) return;
        // Week key = Monday of that week
        const day = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((day + 6) % 7));
        const key = monday.toISOString().slice(0, 10);
        if (!buckets[key]) buckets[key] = { week: key, words: 0, chapters: 0, fics: 0 };
        buckets[key].words += item.word_count_read || item.word_count || 0;
        buckets[key].chapters += item.chapters_read || 1;
        buckets[key].fics += item._isFicCompletion ? 1 : 0;
      });
      return Object.values(buckets).sort((a, b) => a.week.localeCompare(b.week));
    }

    function bucketByMonth(items, dateKey) {
      const buckets = {};
      items.forEach(item => {
        const d = new Date(item[dateKey]);
        if (isNaN(d)) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!buckets[key]) buckets[key] = { month: key, words: 0, chapters: 0, fics: 0 };
        buckets[key].words += item.word_count_read || item.word_count || 0;
        buckets[key].chapters += item.chapters_read || 1;
        buckets[key].fics += item._isFicCompletion ? 1 : 0;
      });
      return Object.values(buckets).sort((a, b) => a.month.localeCompare(b.month));
    }

    // --- Build unified activity timeline ---
    // Merge reading_log entries with bootstrapped events from reading_status
    const activityEvents = [];

    // 1. Real reading_log entries (these have precise timestamps)
    readingLog.forEach(entry => {
      activityEvents.push({
        work_id: entry.work_id,
        read_at: entry.read_at,
        word_count_read: entry.word_count_read || 0,
        chapters_read: entry.chapters_read || 0,
        _isFicCompletion: false,
        _source: 'log',
      });
    });

    // 2. Bootstrap from reading_status timestamps (for pre-logging history)
    const loggedWorkIds = new Set(readingLog.map(e => e.work_id));
    works.forEach(w => {
      const st = statuses[w.id];
      if (!st) return;

      // If this work has real log entries, skip bootstrapping
      if (loggedWorkIds.has(w.id)) return;

      // Use completed_at as a completion event
      if (st.completed_at) {
        activityEvents.push({
          work_id: w.id,
          read_at: st.completed_at,
          word_count_read: w.word_count || 0,
          chapters_read: w.chapter_count || 1,
          _isFicCompletion: true,
          _source: 'bootstrap',
        });
      }
      // Use started_at as a "started reading" event (estimate 1 chapter)
      else if (st.started_at && st.status === 'reading') {
        const wordsPerCh = w.word_count && w.chapter_count
          ? Math.round(w.word_count / w.chapter_count) : 0;
        const chaptersRead = st.current_chapter || 1;
        activityEvents.push({
          work_id: w.id,
          read_at: st.started_at,
          word_count_read: chaptersRead * wordsPerCh,
          chapters_read: chaptersRead,
          _isFicCompletion: false,
          _source: 'bootstrap',
        });
      }
    });

    // Mark completion events from log entries too
    const completedWorkIds = new Set();
    works.forEach(w => {
      const st = statuses[w.id];
      if (st?.status === 'completed') completedWorkIds.add(w.id);
    });

    // Sort all events chronologically
    activityEvents.sort((a, b) => new Date(a.read_at) - new Date(b.read_at));

    // --- Compute aggregate analytics ---
    // Timeline charts use real events only — bootstrap events create a
    // misleading spike at import time that dwarfs actual reading activity.
    const realTimelineEvents = activityEvents.filter(e => e._source === 'log');
    const weeklyActivity = bucketByWeek(realTimelineEvents, 'read_at');
    const monthlyActivity = bucketByMonth(realTimelineEvents, 'read_at');

    // Total words read (from all events)
    const totalWordsRead = activityEvents.reduce((sum, e) => sum + (e.word_count_read || 0), 0);
    const totalChaptersRead = activityEvents.reduce((sum, e) => sum + (e.chapters_read || 0), 0);

    // Completion stats
    const completedWorks = works.filter(w => statuses[w.id]?.status === 'completed');
    const totalCompleted = completedWorks.length;
    const totalStarted = works.filter(w => {
      const s = statuses[w.id]?.status;
      return s === 'reading' || s === 'completed';
    }).length;
    const completionRate = totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 0;

    // Average words per completed fic
    const avgWordsPerFic = totalCompleted > 0
      ? Math.round(completedWorks.reduce((s, w) => s + (w.word_count || 0), 0) / totalCompleted)
      : 0;

    // Reading pace: words per day over the last 30 days
    // Uses only real log events — bootstrap events would inflate this
    // with "words" from organizing your library, not actual reading.
    const realEventsOnly = activityEvents.filter(e => e._source === 'log');
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentEvents = realEventsOnly.filter(e => new Date(e.read_at) >= thirtyDaysAgo);
    const recentWords = recentEvents.reduce((s, e) => s + (e.word_count_read || 0), 0);
    const wordsPerDay = Math.round(recentWords / 30);

    // Reading streak: consecutive days with real activity
    const activeDays = new Set();
    realEventsOnly.forEach(e => {
      const d = new Date(e.read_at);
      if (!isNaN(d)) activeDays.add(d.toISOString().slice(0, 10));
    });
    const sortedDays = Array.from(activeDays).sort();
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    const todayStr = now.toISOString().slice(0, 10);
    const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

    for (let i = 0; i < sortedDays.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const prev = new Date(sortedDays[i - 1]);
        const curr = new Date(sortedDays[i]);
        const diffDays = Math.round((curr - prev) / 86400000);
        tempStreak = diffDays === 1 ? tempStreak + 1 : 1;
      }
      longestStreak = Math.max(longestStreak, tempStreak);

      // Current streak: must include today or yesterday
      if (sortedDays[i] === todayStr || sortedDays[i] === yesterdayStr) {
        currentStreak = Math.max(currentStreak, tempStreak);
      }
    }

    // Fandom breakdown over time (monthly)
    const fandomTimeline = {};
    activityEvents.forEach(e => {
      const d = new Date(e.read_at);
      if (isNaN(d)) return;
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const work = works.find(w => w.id === e.work_id);
      if (!work) return;
      (work.fandoms || []).forEach(f => {
        if (!fandomTimeline[f]) fandomTimeline[f] = {};
        if (!fandomTimeline[f][monthKey]) fandomTimeline[f][monthKey] = 0;
        fandomTimeline[f][monthKey] += e.word_count_read || 0;
      });
    });

    // Get top 5 fandoms for the timeline chart
    const fandomTotals = {};
    Object.entries(fandomTimeline).forEach(([f, months]) => {
      fandomTotals[f] = Object.values(months).reduce((s, v) => s + v, 0);
    });
    const topFandomNames = Object.entries(fandomTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // Build stacked area chart data: each row is a month, columns are fandoms
    const allMonths = new Set();
    Object.values(fandomTimeline).forEach(months => {
      Object.keys(months).forEach(m => allMonths.add(m));
    });
    const fandomAreaData = Array.from(allMonths).sort().map(month => {
      const row = { month };
      topFandomNames.forEach(f => {
        row[f] = fandomTimeline[f]?.[month] || 0;
      });
      return row;
    });

    // Rating distribution of completed works (personal ratings)
    const ratingDistribution = [1, 2, 3, 4, 5].map(r => ({
      rating: `${r}★`,
      count: completedWorks.filter(w => statuses[w.id]?.rating_personal === r).length,
    }));
    const avgRating = completedWorks.length > 0
      ? (completedWorks.reduce((s, w) => s + (statuses[w.id]?.rating_personal || 0), 0) /
        completedWorks.filter(w => statuses[w.id]?.rating_personal > 0).length).toFixed(1)
      : 'N/A';

    // Time to complete: days between started_at and completed_at
    const completionTimes = completedWorks
      .filter(w => statuses[w.id]?.started_at && statuses[w.id]?.completed_at)
      .map(w => {
        const start = new Date(statuses[w.id].started_at);
        const end = new Date(statuses[w.id].completed_at);
        return Math.max(1, Math.round((end - start) / 86400000));
      });
    const avgDaysToComplete = completionTimes.length > 0
      ? Math.round(completionTimes.reduce((s, d) => s + d, 0) / completionTimes.length)
      : null;
    const fastestComplete = completionTimes.length > 0 ? Math.min(...completionTimes) : null;

    // --- Wrapped data (current month + current year) ---
    // IMPORTANT: Wrapped only uses real reading_log events, not bootstrapped
    // events from import timestamps. The bootstrap is useful for lifetime
    // aggregate stats, but time-bounded summaries need to reflect actual
    // reading activity — not "I organized my library on this date."
    const realEvents = activityEvents.filter(e => e._source === 'log');
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    function wrappedForPeriod(startDate, endDate, label) {
      const periodEvents = realEvents.filter(e => {
        const d = new Date(e.read_at);
        return d >= startDate && d <= endDate;
      });
      const periodWords = periodEvents.reduce((s, e) => s + (e.word_count_read || 0), 0);
      const periodChapters = periodEvents.reduce((s, e) => s + (e.chapters_read || 0), 0);

      // Completed in period — only count fics with real log entries in this period
      const periodWorkIds = new Set(periodEvents.map(e => e.work_id));
      const periodCompleted = completedWorks.filter(w => {
        const ca = statuses[w.id]?.completed_at;
        if (!ca) return false;
        const d = new Date(ca);
        return d >= startDate && d <= endDate && periodWorkIds.has(w.id);
      });

      // Top fandom in period
      const pFandomCount = {};
      periodEvents.forEach(e => {
        const work = works.find(w => w.id === e.work_id);
        if (!work) return;
        (work.fandoms || []).forEach(f => {
          pFandomCount[f] = (pFandomCount[f] || 0) + (e.word_count_read || 0);
        });
      });
      const topFandom = Object.entries(pFandomCount).sort((a, b) => b[1] - a[1])[0];

      // Top ship in period
      const pShipCount = {};
      periodEvents.forEach(e => {
        const work = works.find(w => w.id === e.work_id);
        if (!work) return;
        (work.relationships || []).forEach(r => {
          pShipCount[r] = (pShipCount[r] || 0) + 1;
        });
      });
      const topShip = Object.entries(pShipCount).sort((a, b) => b[1] - a[1])[0];

      // Longest fic completed in period
      const longestFic = periodCompleted.length > 0
        ? periodCompleted.reduce((best, w) => (w.word_count || 0) > (best.word_count || 0) ? w : best)
        : null;

      return {
        label,
        words: periodWords,
        chapters: periodChapters,
        ficsCompleted: periodCompleted.length,
        topFandom: topFandom ? topFandom[0] : null,
        topFandomWords: topFandom ? topFandom[1] : 0,
        topShip: topShip ? topShip[0] : null,
        longestFic,
        uniqueFandoms: Object.keys(pFandomCount).length,
      };
    }

    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);

    const monthlyWrapped = wrappedForPeriod(monthStart, monthEnd,
      monthStart.toLocaleString('default', { month: 'long', year: 'numeric' }));
    const yearlyWrapped = wrappedForPeriod(yearStart, yearEnd, `${currentYear}`);

    return {
      // Timeline data
      weeklyActivity,
      monthlyActivity,
      fandomAreaData,
      topFandomNames,

      // Aggregate stats
      totalWordsRead,
      totalChaptersRead,
      totalCompleted,
      completionRate,
      avgWordsPerFic,
      wordsPerDay,
      currentStreak,
      longestStreak,
      avgDaysToComplete,
      fastestComplete,
      avgRating,
      ratingDistribution,

      // Wrapped
      monthlyWrapped,
      yearlyWrapped,

      // Meta
      hasLogData: readingLog.length > 0,
      totalEvents: activityEvents.length,
    };
  }, [works, statuses, readingLog]);
}

import { useId } from 'react';
import type { ProgressDay } from '@studibrowse/shared';
import { useElementWidth } from '../../hooks/useElementWidth';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatGoal, formatMins } from '../rooms/timerText';
import styles from './FocusByDayChart.module.css';
import { chartMax, dailyPace, rangeLabel, weekdayOf } from './format';

interface FocusByDayChartProps {
  /** Sunday to Saturday. */
  days: ProgressDay[];
  /** "2026-11-04", today in the user's time zone. */
  today: string;
  goalMins: number;
}

// The mockup's .chart: 220px tall (180 on phones), day labels in a 32px strip under the bars.
const HEIGHT = { wide: 220, phone: 180 };
const GAP = { wide: 16, phone: 8 };
const LABEL_STRIP = 32;
const MAX_BAR_WIDTH = 48;
const MIN_BAR_SHARE = 0.03;
const FALLBACK_WIDTH = 640;

/** A bar with 10px rounded top corners and 4px bottom ones, standing on `bottom`. */
function barPath(x: number, width: number, top: number, bottom: number): string {
  const height = bottom - top;
  const rt = Math.min(10, width / 2, height / 2);
  const rb = Math.min(4, width / 2, height / 2);
  const right = x + width;
  return [
    `M${x},${bottom - rb}`,
    `V${top + rt}`,
    `A${rt},${rt} 0 0 1 ${x + rt},${top}`,
    `H${right - rt}`,
    `A${rt},${rt} 0 0 1 ${right},${top + rt}`,
    `V${bottom - rb}`,
    `A${rb},${rb} 0 0 1 ${right - rb},${bottom}`,
    `H${x + rb}`,
    `A${rb},${rb} 0 0 1 ${x},${bottom - rb}`,
    'Z',
  ].join(' ');
}

/** "Sunday 1h 35m, Monday 0m, … Daily pace for 12h: 1h 43m." */
function describe(days: ProgressDay[], goalMins: number): string {
  const perDay = days.map((day) => `${weekdayOf(day.date, true)} ${formatMins(day.focusMins)}`).join(', ');
  return goalMins > 0
    ? `${perDay}. Daily pace for ${formatGoal(goalMins)}: ${formatMins(dailyPace(goalMins))}.`
    : `${perDay}.`;
}

/**
 * Progress › Focus time by day (mockup `#progress` `.chart`): your minutes each day this week as bars,
 * today's highlighted, with a dashed line at the daily pace for your weekly goal. Drawn as SVG at the
 * container's real width so corners and text never stretch; one `role="img"` with a full text description.
 */
export function FocusByDayChart({ days, today, goalMins }: FocusByDayChartProps) {
  const titleId = useId();
  const descId = useId();
  const gradientId = useId().replace(/:/g, '');
  const { ref, width } = useElementWidth<HTMLDivElement>(FALLBACK_WIDTH);
  const phone = useMediaQuery('(max-width: 767px)');
  const height = phone ? HEIGHT.phone : HEIGHT.wide;
  const gap = phone ? GAP.phone : GAP.wide;

  const plotBottom = height - LABEL_STRIP;
  const max = chartMax(days, goalMins);
  const columnWidth = (width - gap * (days.length - 1)) / days.length;
  const barWidth = Math.min(MAX_BAR_WIDTH, columnWidth);
  const yOf = (mins: number) => plotBottom - (mins / max) * plotBottom;
  const paceY = yOf(dailyPace(goalMins));
  const empty = days.every((day) => day.focusMins === 0);

  return (
    <div ref={ref} className={styles.chart}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className={styles.svg}
      >
        <title id={titleId}>Focus time by day, {rangeLabel(days)}</title>
        <desc id={descId}>{describe(days, goalMins)}</desc>
        <defs>
          <linearGradient id={`${gradientId}-has`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className={styles.hasTop} />
            <stop offset="1" className={styles.hasBottom} />
          </linearGradient>
          <linearGradient id={`${gradientId}-today`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className={styles.todayTop} />
            <stop offset="1" className={styles.todayBottom} />
          </linearGradient>
        </defs>

        {days.map((day, index) => {
          const isToday = day.date === today;
          const center = index * (columnWidth + gap) + columnWidth / 2;
          const top = Math.min(yOf(day.focusMins), plotBottom * (1 - MIN_BAR_SHARE));
          let fill = 'var(--surface-3)';
          if (day.focusMins > 0) fill = `url(#${gradientId}-${isToday ? 'today' : 'has'})`;
          return (
            <g key={day.date}>
              <title>{`${weekdayOf(day.date, true)}: ${formatMins(day.focusMins)}`}</title>
              <path d={barPath(center - barWidth / 2, barWidth, top, plotBottom)} fill={fill} />
              {day.focusMins > 0 ? (
                <text x={center} y={top - 6} textAnchor="middle" className={styles.value}>
                  {formatMins(day.focusMins)}
                </text>
              ) : null}
              <text
                x={center}
                y={plotBottom + 25}
                textAnchor="middle"
                className={isToday ? `${styles.day} ${styles.today}` : styles.day}
              >
                {weekdayOf(day.date)}
              </text>
            </g>
          );
        })}

        {goalMins > 0 ? (
          <g className={styles.pace}>
            <line x1={0} x2={width} y1={paceY} y2={paceY} />
            <text x={width} y={paceY - 8} textAnchor="end">
              Daily pace for {formatGoal(goalMins)}
            </text>
          </g>
        ) : null}
      </svg>
      {empty ? (
        <p className={styles.empty} aria-hidden="true">
          Finish a focus round to see it here.
        </p>
      ) : null}
    </div>
  );
}

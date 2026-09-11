import styles from '../../styles/Attendance.module.css';
import type { AttendanceStats } from './types';

export default function AttendanceGauge({ stats }: { stats: AttendanceStats | null }) {
  const pct = stats?.attendanceRate ?? 0;
  const r = 46;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className={styles.topLeft}>
      <div className={styles.gaugeWrap}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={r} fill="none" stroke="#f3f4f6" strokeWidth="12" />
          <circle
            cx="60" cy="60" r={r} fill="none" stroke="#dc2626" strokeWidth="12"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" transform="rotate(-90 60 60)"
          />
          <text x="60" y="57" textAnchor="middle" fontSize="22" fontWeight="700" fill="#111827">{pct}%</text>
          <text x="60" y="72" textAnchor="middle" fontSize="10" fill="#9ca3af">出席率</text>
        </svg>
      </div>
      <div className={styles.statsGrid}>
        {[
          { label: '出席', value: String(stats?.present ?? 0), color: '#111827' },
          { label: '欠席', value: String(stats?.absent ?? 0), color: '#dc2626' },
          { label: '遅刻', value: String(stats?.late ?? 0), color: '#3b82f6' },
          { label: '公欠', value: String(stats?.excused ?? 0), color: '#111827' },
        ].map((s) => (
          <div key={s.label} className={styles.statCard}>
            <span className={styles.statLabel}>{s.label}</span>
            <span className={styles.statValue} style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

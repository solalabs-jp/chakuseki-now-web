import styles from '../../styles/Attendance.module.css';
import type { Status } from './types';

// iOS 版(chakuseki-now-ios/Models/Constants.swift の AppColors)の
// ステータス配色に合わせる。「中抜け」は iOS 側に対応するケースが無く、
// AttendanceStatus(firestoreValue:) で mid_absence を早退(.earlyDeparture)
// として扱っているため、同じ色にする。
const STATUS_COLORS: Record<Status, { bg: string; color: string }> = {
  '出席': { bg: 'rgba(19, 93, 178, 0.12)', color: '#135DB2' }, // statusAttendance
  '遅刻': { bg: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B' }, // statusTardiness
  '欠席': { bg: 'rgba(255, 218, 214, 0.10)', color: '#BA1A1A' }, // statusAbsence
  '公欠': { bg: 'rgba(207, 250, 254, 0.30)', color: '#06B6D4' }, // statusOfficialAbsence
  '早退': { bg: 'rgba(132, 204, 22, 0.12)', color: '#84CC16' }, // statusEarlyDeparture
  '中抜け': { bg: 'rgba(132, 204, 22, 0.12)', color: '#84CC16' }, // mid_absence → earlyDeparture と同色
};

export default function StatusChip({ status }: { status: Status }) {
  const s = STATUS_COLORS[status];
  return (
    <span className={styles.statusChip} style={{ background: s.bg, color: s.color }}>
      <span className={styles.dot} style={{ background: s.color }} />
      {status}
    </span>
  );
}

import styles from '../../styles/Attendance.module.css';
import { FilterIcon, SearchIcon } from './icons';
import StatusChip from './StatusChip';
import type { RealtimeStudent } from './types';

const AVATAR_COLORS = ['#3b82f6', '#7c3aed', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9'];

function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

type RealtimeAttendanceTableProps = {
  students: RealtimeStudent[];
  deletingId: string | null;
  onDelete: (recordId: string) => void;
};

export default function RealtimeAttendanceTable({ students, deletingId, onDelete }: RealtimeAttendanceTableProps) {
  return (
    <div className={styles.listSection}>
      <div className={styles.listHeader}>
        <div className={styles.listTitleRow}>
          <span className={styles.listTitle}>リアルタイム出席リスト</span>
          <span className={styles.liveBadge}>LIVE</span>
        </div>
        <div className={styles.listActions}>
          <div className={styles.searchBox}>
            <SearchIcon />
            <input className={styles.searchInput} placeholder="氏名・学籍番号で検索" />
          </div>
          <button className={styles.filterBtn}><FilterIcon /></button>
        </div>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>学籍番号</th>
            <th className={styles.th}>氏名</th>
            <th className={styles.th}>ステータス</th>
            <th className={styles.th}>打刻時間</th>
            <th className={styles.th}>コメント</th>
            <th className={styles.th} aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={s.recordId} className={styles.tr}>
              <td className={styles.td}><span className={styles.idText}>{s.id}</span></td>
              <td className={styles.td}>
                <div className={styles.nameCell}>
                  <div className={styles.avatar} style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                    {initialsFromName(s.name)}
                  </div>
                  <span className={styles.studentName}>{s.name}</span>
                </div>
              </td>
              <td className={styles.td}><StatusChip status={s.status} /></td>
              <td className={styles.td}><span className={styles.timeText}>{s.time}</span></td>
              <td className={styles.td}>
                <span className={s.comment ? styles.comment : styles.commentNone}>
                  {s.comment ?? 'コメントなし'}
                </span>
              </td>
              <td className={styles.actionTd}>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => onDelete(s.recordId)}
                  disabled={deletingId === s.recordId}
                >
                  {deletingId === s.recordId ? '削除中…' : '削除'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

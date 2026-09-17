import styles from '../../styles/Attendance.module.css';
import { formatBeaconId } from '../../lib/beaconId';
import { BluetoothIcon, PlusIcon, SearchIcon } from './icons';
import type { Teacher } from './types';

type TeacherTableProps = {
  teachers: Teacher[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenCreate: () => void;
  onEdit: (teacher: Teacher) => void;
  onDelete: (teacher: Teacher) => void;
};

export default function TeacherTable({
  teachers,
  loading,
  error,
  search,
  onSearchChange,
  onOpenCreate,
  onEdit,
  onDelete,
}: TeacherTableProps) {
  return (
    <div className={styles.listSection}>
      <div className={styles.listHeader}>
        <div className={styles.listTitleRow}>
          <span className={styles.listTitle}>教員一覧</span>
        </div>
        <div className={styles.listActions}>
          <div className={styles.searchBox}>
            <SearchIcon />
            <input
              className={styles.searchInput}
              placeholder="氏名・メールで検索"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <button className={styles.monitorDisplayBtn} onClick={onOpenCreate}>
            <PlusIcon />
            新規教員を追加
          </button>
        </div>
      </div>

      {loading && <p className={styles.commentNone}>読み込み中...</p>}
      {error && <p style={{ color: '#dc2626', fontSize: 12 }}>データ取得エラー: {error}</p>}

      {!loading && !error && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>教員ID</th>
              <th className={styles.th}>氏名</th>
              <th className={styles.th}>メールアドレス</th>
              <th className={styles.th}>担任クラス</th>
              <th className={styles.th}>BLEビーコンID</th>
              <th className={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className={styles.tr}>
                <td className={styles.td}><span className={styles.idText}>{t.id}</span></td>
                <td className={styles.td}>
                  <div className={styles.nameCell}>
                    <div className={styles.avatar} style={{ background: '#3b82f6' }}>
                      {t.name.slice(0, 1)}
                    </div>
                    <span className={styles.studentName}>{t.name}</span>
                  </div>
                </td>
                <td className={styles.td}><span className={styles.timeText}>{t.email}</span></td>
                <td className={styles.td}><span className={styles.timeText}>{t.className || '未設定'}</span></td>
                <td className={styles.td}>
                  <span className={styles.statusChip} style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                    <BluetoothIcon />
                    {t.beaconId ? formatBeaconId(t.beaconId) : '未登録'}
                  </span>
                </td>
                <td className={styles.td}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={styles.monitorDisplayBtn}
                      style={{ background: '#fff', color: '#374151', border: '1px solid #e5e7eb' }}
                      onClick={() => onEdit(t)}
                    >
                      編集
                    </button>
                    <button
                      className={styles.monitorDisplayBtn}
                      style={{ background: '#fff', color: '#dc2626', border: '1px solid #fecaca' }}
                      onClick={() => onDelete(t)}
                    >
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

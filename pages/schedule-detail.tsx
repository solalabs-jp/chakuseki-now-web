import type { NextPage } from 'next';
import Link from 'next/link';
import styles from '../styles/ScheduleDetail.module.css';
import UserProfileButton from '../components/UserProfileButton';


function BellIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="#6b7280" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function UserCircleIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="#6b7280" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="10" r="3"/>
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg width="12" height="12" fill="none" stroke="#6b7280" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <polyline points="23 20 23 14 17 14"/>
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="12" height="12" fill="none" stroke="#6b7280" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="#d1d5db" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  );
}

type ClassCell = {
  period: string;
  subject: string;
  teacher: string;
  room: string;
  icon: 'sync' | 'edit';
} | null;

// Weekly timetable data: [mon, tue, wed, thu, fri] per row
const timetable: ClassCell[][] = [
  [
    { period: '1限（9:00-10:30）', subject: 'プログラミング演習II', teacher: '山田 太郎', room: '第3PCルーム', icon: 'sync' },
    null,
    null,
    { period: '1限（9:00-10:30）', subject: 'ネットワーク技術', teacher: '鈴木 一郎', room: '第2PCルーム', icon: 'sync' },
    null,
  ],
  [
    null,
    { period: '2限（10:40-12:10）', subject: 'データベース概論', teacher: '佐藤 花子', room: '大講義室A', icon: 'edit' },
    null,
    null,
    { period: '2限（10:40-12:10）', subject: 'キャリアデザイン', teacher: '田中 義夫', room: '講義室101', icon: 'edit' },
  ],
];

const days = ['月', '火', '水', '木', '金'];

const ScheduleDetailPage: NextPage = () => {
  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>時間割登録</h1>
          <p className={styles.subtitle}>2024年度 前期 / 情報システム学科 2年A組</p>
        </div>
        <div className={styles.headerRight}>
          <Link href="/schedule-upload" className={styles.outlineBtn}>
            + 一括追加
          </Link>
          <button className={styles.primaryBtn}>+ 新規授業追加</button>
          <button className={styles.iconBtn}><BellIcon /></button>
          <UserProfileButton />
        </div>
      </div>

      {/* Weekly grid */}
      <div className={styles.gridWrap}>
        {/* Day headers */}
        <div className={styles.gridRow}>
          <div className={styles.emptyCell} />
          {days.map((d) => (
            <div key={d} className={styles.dayHeader}>{d}</div>
          ))}
        </div>

        {/* Timetable rows */}
        {timetable.map((row, rowIdx) => (
          <div key={rowIdx} className={styles.gridRow}>
            <div className={styles.periodLabel}>{rowIdx + 1}限</div>
            {row.map((cell, colIdx) => (
              <div key={colIdx} className={styles.cell}>
                {cell ? (
                  <div className={styles.classCard}>
                    <div className={styles.cardTopRow}>
                      <span className={styles.periodBadge}>{cell.period}</span>
                      <span>{cell.icon === 'sync' ? <SyncIcon /> : <EditIcon />}</span>
                    </div>
                    <div className={styles.cardSubject}>{cell.subject}</div>
                    <div className={styles.cardMeta}>
                      <PersonIcon />
                      <span>{cell.teacher}</span>
                    </div>
                    <div className={styles.cardMeta}>
                      <LocationIcon />
                      <span>{cell.room}</span>
                    </div>
                  </div>
                ) : (
                  <button className={styles.emptyCell2}>
                    <PlusIcon />
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScheduleDetailPage;

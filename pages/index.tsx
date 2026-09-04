import { useEffect, useRef, useState } from 'react';
import type { NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from '../styles/Home.module.css';
import scheduleStyles from '../styles/Schedule.module.css';
import UserProfileButton from '../components/UserProfileButton';
import { authHeaders } from '../lib/clientAuth';


function BellIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="#6b7280" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function UserCircleIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="#6b7280" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </svg>
  );
}


type ScheduleStatus = 'past' | 'current' | 'next' | 'planned';

type ScheduleItem = {
  scheduleId: string;
  status: ScheduleStatus;
  badge: string;
  start: string;
  end: string;
  subject: string;
  meta: string;
  rightLabel: string;
  attendance: string;
  percent: number;
  attended: number;
  total: number;
};

const BADGE_LABELS: Record<ScheduleStatus, string> = {
  past: '終了',
  current: '現在の授業',
  next: '次の授業',
  planned: '予定',
};

type ApiScheduleEntry = {
  scheduleId: string;
  subjectName: string;
  className: string;
  period: number | null;
  start: string;
  end: string;
  status: ScheduleStatus;
  attended: number;
  total: number;
};

function toScheduleItem(entry: ApiScheduleEntry): ScheduleItem {
  const isDone = entry.status === 'past' || entry.status === 'current';
  return {
    scheduleId: entry.scheduleId,
    status: entry.status,
    badge: BADGE_LABELS[entry.status],
    start: entry.start,
    end: entry.end,
    subject: entry.subjectName,
    meta: `${entry.period ?? ''}限・${entry.className}`,
    rightLabel: entry.status === 'past' ? '最終出席数' : entry.status === 'current' ? '' : '予定出席数',
    attendance: isDone ? `${entry.attended} / ${entry.total}名` : `- / ${entry.total}名`,
    percent: isDone && entry.total > 0 ? Math.round((entry.attended / entry.total) * 100) : 0,
    attended: entry.attended,
    total: entry.total,
  };
}

type ClassOption = {
  id: string;
  name: string;
};

const Home: NextPage = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'担当授業' | '担任クラス'>('担当授業');
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('class-2A');
  const currentRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/api/timetable/classes', { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) return;
        setClasses(data.classes);
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetch(`/api/dashboard/today?classId=${encodeURIComponent(selectedClassId)}`, { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) return;
        setScheduleItems((data.schedule as ApiScheduleEntry[]).map(toScheduleItem));
      })
      .catch(() => { });
  }, [selectedClassId]);

  const highlightedScheduleId =
    scheduleItems.find((item) => item.status === 'current')?.scheduleId ??
    scheduleItems.find((item) => item.status === 'next')?.scheduleId ??
    null;

  useEffect(() => {
    if (!highlightedScheduleId) return;
    currentRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedScheduleId]);

  const handleTab = (tab: '担当授業' | '担任クラス') => {
    setActiveTab(tab);
    if (tab === '担任クラス') router.push('/class');
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>概要</h1>
          <p className={styles.subtitle}>本日のスケジュールと活動</p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.tabGroup}>
            <button
              className={`${styles.tab} ${activeTab === '担当授業' ? styles.tabActive : ''}`}
              onClick={() => handleTab('担当授業')}
            >担当授業</button>
            <button
              className={`${styles.tab} ${activeTab === '担任クラス' ? styles.tabActive : ''}`}
              onClick={() => handleTab('担任クラス')}
            >担任クラス</button>
          </div>
          <button className={styles.iconBtn}><BellIcon /></button>
          <UserProfileButton />
        </div>
      </div>

      <div className={styles.monitorRow}>
        <div className={scheduleStyles.filterLeft}>
          <span className={scheduleStyles.filterLabel}>クラス:</span>
          {classes.map((cls) => (
            <button
              key={cls.id}
              className={`${scheduleStyles.termBtn} ${selectedClassId === cls.id ? scheduleStyles.termActive : ''}`}
              onClick={() => setSelectedClassId(cls.id)}
            >
              {cls.name.replace(/^\d{4}-/, '')}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.sectionHeader}>
        <svg width="14" height="14" fill="none" stroke="#dc2626" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" strokeLinecap="round" /></svg>
        <span className={styles.sectionLabel}>本日の授業</span>
      </div>

      <div className={styles.scheduleList}>
        {scheduleItems.map((item) => (
          <div
            key={item.scheduleId}
            ref={item.scheduleId === highlightedScheduleId ? currentRowRef : undefined}
            className={`${styles.scheduleRow} ${styles[`row_${item.status}`]}`}
          >
            <div className={styles.rowLeft}>
              <span className={`${styles.badge} ${styles[`badge_${item.status}`]}`}>
                {item.badge}
              </span>
              <div className={styles.timeBlock}>
                <span className={`${styles.timeMain} ${item.status === 'current' ? styles.timeMainCurrent : ''}`}>
                  {item.start}
                </span>
                <span className={styles.timeSub}>-{item.end}</span>
              </div>
              <div>
                <div className={styles.subject}>{item.subject}</div>
                <div className={styles.meta}>{item.meta}</div>
              </div>
            </div>

            <div className={styles.rowRight}>
              {item.status === 'current' ? (
                <>
                  <div className={styles.seatGrid}>
                    {Array.from({ length: item.total }, (_, i) => (
                      <span key={i} className={`${styles.seat} ${i < item.attended ? styles.seatOn : styles.seatOff}`} />
                    ))}
                  </div>
                  <div className={styles.attendRow}>
                    <span className={styles.attendVal}>{item.attended} / {item.total}名</span>
                    <span className={styles.percentBadge}>{item.percent}%以上</span>
                  </div>
                  <div className={styles.bar}><div className={styles.barFill} style={{ width: `${item.percent}%`, background: '#dc2626' }} /></div>
                  <Link href="/attendance" className={styles.detailBtn}>詳細を見る</Link>
                </>
              ) : (
                <>
                  {item.rightLabel && <span className={styles.rightLabel}>{item.rightLabel}</span>}
                  <span className={styles.attendVal}>{item.attendance}</span>
                  <div className={styles.bar}>
                    {item.percent > 0 && <div className={styles.barFill} style={{ width: `${item.percent}%`, background: '#d1d5db' }} />}
                  </div>
                </>
              )}
            </div>

            <div className={styles.chevron}>›</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;

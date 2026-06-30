import { useState } from 'react';
import type { NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from '../styles/Home.module.css';

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

function MonitorIcon() {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>
  );
}

const scheduleItems = [
  {
    status: 'past',
    badge: '終了',
    start: '08:00',
    end: '09:15 AM',
    subject: '現代文',
    meta: '1限・教室 201',
    rightLabel: '最終出席数',
    attendance: '38 / 40名',
    percent: 95,
  },
  {
    status: 'current',
    badge: '現在の授業',
    start: '09:30',
    end: '11:00 AM',
    subject: '高度な数学',
    meta: '2限・教室 304',
    rightLabel: '',
    attendance: '32 / 40',
    percent: 80,
  },
  {
    status: 'next',
    badge: '次の授業',
    start: '11:15',
    end: '12:45 PM',
    subject: '世界史',
    meta: '3限・教室 202',
    rightLabel: '予定出席数',
    attendance: '- / 40名',
    percent: 0,
  },
  {
    status: 'planned',
    badge: '予定',
    start: '13:00',
    end: '14:30 PM',
    subject: '物理',
    meta: '4限・ラボ 2',
    rightLabel: '予定出席数',
    attendance: '- / 40名',
    percent: 0,
  },
];

const Home: NextPage = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'担当授業' | '担任クラス'>('担当授業');

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
          <button className={styles.iconBtn}><UserCircleIcon /></button>
        </div>
      </div>

      <div className={styles.monitorRow}>
        <Link href="/monitor" className={styles.monitorBtn}>
          <MonitorIcon />
          モニター投影画面を開く
        </Link>
      </div>

      <div className={styles.sectionHeader}>
        <svg width="14" height="14" fill="none" stroke="#dc2626" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round"/></svg>
        <span className={styles.sectionLabel}>本日の授業</span>
      </div>

      <div className={styles.scheduleList}>
        {scheduleItems.map((item) => (
          <div
            key={item.subject}
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
                    {Array.from({ length: 40 }, (_, i) => (
                      <span key={i} className={`${styles.seat} ${i < 32 ? styles.seatOn : styles.seatOff}`} />
                    ))}
                  </div>
                  <div className={styles.attendRow}>
                    <span className={styles.attendVal}>32 / 40名</span>
                    <span className={styles.percentBadge}>80%以上</span>
                  </div>
                  <div className={styles.bar}><div className={styles.barFill} style={{ width: '80%', background: '#dc2626' }} /></div>
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

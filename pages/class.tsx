import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useState } from 'react';
import styles from '../styles/Class.module.css';
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

function SearchIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="#6b7280" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="14" height="14" fill="#f59e0b" viewBox="0 0 24 24">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <line x1="12" y1="17" x2="12.01" y2="17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

const watchStudents = [
  { name: '稲吉 悠斗', initials: 'IY', note: '今週3日間欠席', pct: '78%', color: '#dc2626' },
  { name: '成毛 迅哉', initials: 'NJ', note: '今月4回遅刻', pct: '85%', color: '#f59e0b' },
  { name: '杉田 泰貴', initials: 'ST', note: '連続欠席', pct: '81%', color: '#dc2626' },
];

type StatusType = '出席' | '欠席' | '遅刻' | '遅刻15m' | '–';

const classStudents: Array<{
  name: string;
  initials: string;
  color: string;
  p1: StatusType;
  p2: StatusType;
  p3: StatusType;
  p4: StatusType;
  p5: StatusType;
}> = [
  { name: '稲吉 悠斗', initials: 'IY', color: '#1d4ed8', p1: '出席', p2: '出席', p3: '出席', p4: '出席', p5: '出席' },
  { name: '鈴木 拓也', initials: 'ST', color: '#dc2626', p1: '欠席', p2: '欠席', p3: '欠席', p4: '欠席', p5: '欠席' },
  { name: '鈴木 廉士', initials: 'SR', color: '#b45309', p1: '遅刻15m', p2: '出席', p3: '出席', p4: '出席', p5: '出席' },
  { name: '省田 悠綜', initials: 'MJ', color: '#6b7280', p1: '出席', p2: '出席', p3: '–', p4: '–', p5: '–' },
];

function StatusBadge({ status }: { status: StatusType }) {
  const map: Record<StatusType, { label: string; bg: string; color: string }> = {
    '出席': { label: '出席', bg: '#d1fae5', color: '#047857' },
    '欠席': { label: '欠席', bg: '#fee2e2', color: '#dc2626' },
    '遅刻': { label: '遅刻', bg: '#fef3c7', color: '#d97706' },
    '遅刻15m': { label: '遅刻 15m', bg: '#fef3c7', color: '#d97706' },
    '–': { label: '–', bg: 'transparent', color: '#9ca3af' },
  };
  const s = map[status];
  return (
    <span
      className={styles.statusBadge}
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

const ClassPage: NextPage = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'担当授業' | '担任クラス'>('担任クラス');

  const handleTab = (tab: '担当授業' | '担任クラス') => {
    setActiveTab(tab);
    if (tab === '担当授業') router.push('/');
  };

  // Circle gauge SVG
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (95 / 100) * circ;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>2Aクラス 概要</h1>
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

      <div className={styles.body}>
        {/* Left panel */}
        <div className={styles.leftCol}>
          {/* Attendance rate card */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>学期出席率</h3>
            <div className={styles.gaugeWrap}>
              <svg width="148" height="148" viewBox="0 0 148 148">
                <circle cx="74" cy="74" r={r} fill="none" stroke="#f3f4f6" strokeWidth="14"/>
                <circle
                  cx="74" cy="74" r={r} fill="none" stroke="#dc2626" strokeWidth="14"
                  strokeDasharray={circ} strokeDashoffset={offset}
                  strokeLinecap="round" transform="rotate(-90 74 74)"
                />
                <text x="74" y="70" textAnchor="middle" fontSize="26" fontWeight="700" fill="#111827">95%</text>
                <text x="74" y="88" textAnchor="middle" fontSize="10" fill="#6b7280">↑+1.2%　今週比</text>
              </svg>
            </div>
          </div>

          {/* Watch list card */}
          <div className={`${styles.card} ${styles.watchCard}`}>
            <div className={styles.watchHeader}>
              <div className={styles.watchTitle}>
                <WarningIcon />
                <span>要フォロー生徒</span>
              </div>
              <button className={styles.linkBtn}>すべて見る</button>
            </div>
            <div className={styles.watchList}>
              {watchStudents.map((s) => (
                <div key={s.name} className={styles.watchRow}>
                  <div className={styles.watchAvatar} style={{ background: s.color }}>
                    {s.initials[0]}
                  </div>
                  <div className={styles.watchInfo}>
                    <span className={styles.watchName}>{s.name}</span>
                    <span className={styles.watchNote}>{s.note}</span>
                  </div>
                  <div className={styles.watchPct}>
                    <span style={{ color: s.color, fontWeight: 700, fontSize: 14 }}>{s.pct}</span>
                    <span className={styles.termLabel}>Term</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel - attendance table */}
        <div className={`${styles.card} ${styles.tableCard}`}>
          <div className={styles.tableHeader}>
            <div>
              <h3 className={styles.cardTitle}>クラスの出席状況（本日）</h3>
              <p className={styles.tableSubtitle}>本日の授業毎出席/欠席状況</p>
            </div>
            <div className={styles.tableActions}>
              <div className={styles.searchBox}>
                <SearchIcon />
                <input className={styles.searchInput} placeholder="生徒を検索..." />
              </div>
              <button className={styles.filterBtn}><FilterIcon /></button>
            </div>
          </div>

          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>生徒</th>
                <th className={styles.th}>P1 (MATH)</th>
                <th className={styles.th}>P2 (SCI)</th>
                <th className={styles.th}>P3 (ENG)</th>
                <th className={styles.th}>P4 (HIST)</th>
                <th className={styles.th}>P5 (ART)</th>
              </tr>
            </thead>
            <tbody>
              {classStudents.map((s) => (
                <tr key={s.name} className={styles.tr}>
                  <td className={styles.td}>
                    <div className={styles.studentCell}>
                      <div className={styles.avatar} style={{ background: s.color }}>{s.initials[0]}</div>
                      <span className={styles.studentName}>{s.name}</span>
                    </div>
                  </td>
                  <td className={styles.td}><StatusBadge status={s.p1} /></td>
                  <td className={styles.td}><StatusBadge status={s.p2} /></td>
                  <td className={styles.td}><StatusBadge status={s.p3} /></td>
                  <td className={styles.td}><StatusBadge status={s.p4} /></td>
                  <td className={styles.td}><StatusBadge status={s.p5} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.tableFooter}>
            Showing 4 of 28 students in Class 2A
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassPage;

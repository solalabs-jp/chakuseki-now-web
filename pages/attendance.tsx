import type { NextPage } from 'next';
import { useState } from 'react';
import UserProfileButton from '../components/UserProfileButton';
import styles from '../styles/Attendance.module.css';

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

function PaperclipIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="#6b7280" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.47"/>
    </svg>
  );
}

const students = [
  { id: '21M001', name: '佐藤 優',   initials: 'SY', color: '#3b82f6', status: '出席' as const, time: '08:45:12', comment: 'よろしくお願いします。' },
  { id: '21M002', name: '田中 太郎', initials: 'TT', color: '#7c3aed', status: '出席' as const, time: '08:48:30', comment: null },
  { id: '21M015', name: '小林 さくら', initials: 'KS', color: '#ec4899', status: '遅刻' as const, time: '09:05:22', comment: '電車遅延のため遅れました。' },
  { id: '21M022', name: '伊藤 結衣', initials: 'YI', color: '#10b981', status: '欠席' as const, time: '--:--:--', comment: '体調不良のためお休みします。' },
  { id: '21M031', name: '渡辺 健太', initials: 'WK', color: '#f59e0b', status: '出席' as const, time: '08:55:01', comment: null },
];

type Status = '出席' | '欠席' | '遅刻';

function StatusChip({ status }: { status: Status }) {
  const map: Record<Status, { bg: string; color: string }> = {
    '出席': { bg: '#fee2e2', color: '#dc2626' },
    '遅刻': { bg: '#dbeafe', color: '#1d4ed8' },
    '欠席': { bg: '#fee2e2', color: '#dc2626' },
  };
  const s = map[status];
  return (
    <span className={styles.statusChip} style={{ background: s.bg, color: s.color }}>
      <span className={styles.dot} style={{ background: s.color }} />
      {status}
    </span>
  );
}

const AttendancePage: NextPage = () => {
  const [question, setQuestion] = useState('');

  // circle gauge
  const pct = 85;
  const r = 46;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>2Aクラス 概要</h1>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.iconBtn}><BellIcon /></button>
          <UserProfileButton />
        </div>
      </div>

      {/* Top section */}
      <div className={styles.topSection}>
        {/* Left: gauge + stats */}
        <div className={styles.topLeft}>
          <div className={styles.gaugeWrap}>
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={r} fill="none" stroke="#f3f4f6" strokeWidth="12"/>
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
              { label: '出席', value: '34', color: '#111827' },
              { label: '欠席', value: '4', color: '#dc2626' },
              { label: '遅刻', value: '2', color: '#3b82f6' },
              { label: '公欠', value: '0', color: '#111827' },
            ].map((s) => (
              <div key={s.label} className={styles.statCard}>
                <span className={styles.statLabel}>{s.label}</span>
                <span className={styles.statValue} style={{ color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: question panel */}
        <div className={styles.questionPanel}>
          <div className={styles.questionPanelTitle}>
            <svg width="14" height="14" fill="none" stroke="#dc2626" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            <span>生徒への質問送信</span>
          </div>
          <label className={styles.fieldLabel}>お題・アンケート内容</label>
          <textarea
            className={styles.textarea}
            placeholder="例：質問内容を記述"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className={styles.questionActions}>
            <button className={styles.attachBtn}>
              <PaperclipIcon />
              添付
            </button>
            <button className={styles.monitorDisplayBtn} onClick={() => alert('モニターに表示します')}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              モニターに表示
            </button>
          </div>
        </div>
      </div>

      {/* Realtime list */}
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
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className={styles.tr}>
                <td className={styles.td}><span className={styles.idText}>{s.id}</span></td>
                <td className={styles.td}>
                  <div className={styles.nameCell}>
                    <div className={styles.avatar} style={{ background: s.color }}>{s.initials}</div>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AttendancePage;

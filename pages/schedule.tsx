import type { NextPage } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from '../styles/Schedule.module.css';
import UserProfileButton from '../components/UserProfileButton';
import { authHeaders } from '../lib/clientAuth';
import { BellIcon, SearchIcon } from '../components/icons';

function InfoIcon() {
  return (
    <svg width="13" height="13" fill="none" stroke="#9ca3af" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 8v4M12 16h.01"/>
    </svg>
  );
}

function StudentsIcon() {
  return (
    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

type ClassCard = {
  id: string;
  name: string;
  gradeYear: number | null;
  studentCount: number;
};

const Schedule: NextPage = () => {
  const [term, setTerm] = useState<'前期' | '後期'>('前期');
  const [classes, setClasses] = useState<ClassCard[]>([]);

  useEffect(() => {
    fetch('/api/timetable/classes', { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) return;
        setClasses(data.classes);
      })
      .catch(() => {});
  }, []);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>クラス別時間割管理</h1>
          <p className={styles.subtitle}>各クラスの週間スケジュール・時間割を設定・確認します。</p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.searchBox}>
            <SearchIcon />
            <input className={styles.searchInput} placeholder="クラス検索..." />
          </div>
          <select className={styles.deptSelect}>
            <option>全学科</option>
            <option>情報システム</option>
            <option>デザイン</option>
          </select>
          <button className={styles.iconBtn}><BellIcon /></button>
          <UserProfileButton />
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filterRow}>
        <div className={styles.filterLeft}>
          <span className={styles.filterLabel}>年度:</span>
          <span className={styles.filterValue}>2024年度</span>
          <span className={styles.filterLabel}>学期:</span>
          <button
            className={`${styles.termBtn} ${term === '前期' ? styles.termActive : ''}`}
            onClick={() => setTerm('前期')}
          >前期</button>
          <button
            className={`${styles.termBtn} ${term === '後期' ? styles.termActive : ''}`}
            onClick={() => setTerm('後期')}
          >後期</button>
        </div>
        <div className={styles.filterRight}>
          <InfoIcon />
          <span className={styles.infoText}>表示中のデータは現生の設定に基づいています</span>
        </div>
      </div>

      {/* Class cards */}
      <div className={styles.cardGrid}>
        {classes.map((cls) => (
          <div key={cls.id} className={styles.classCard}>
            <div className={styles.cardTop}>
              <div className={styles.classIdBadge}>{cls.id.replace('class-', '')}</div>
              <span className={styles.deptBadge} style={{ color: '#3b82f6', background: '#3b82f618' }}>
                {cls.gradeYear ? `${cls.gradeYear}年` : ''}
              </span>
            </div>
            <div className={styles.className}>{cls.name}</div>
            <div className={styles.studentCount}>
              <StudentsIcon />
              <span>{cls.studentCount}名</span>
            </div>
            <Link href={`/schedule-detail?classId=${encodeURIComponent(cls.id)}`} className={styles.detailBtn}>
              詳細を見る →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Schedule;

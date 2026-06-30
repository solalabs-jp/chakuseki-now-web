import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useState } from 'react';
import styles from '../styles/Promotion.module.css';

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

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function RedFlagIcon() {
  return (
    <svg width="12" height="12" fill="#dc2626" viewBox="0 0 24 24">
      <path d="M4 2v20H2V2h2zm2 1.5l14 4.5-14 4.5V3.5z"/>
    </svg>
  );
}

interface Student {
  id: string;
  name: string;
  attendance: string;
  flag?: boolean;
}

const initialStudents: Student[] = [
  { id: '2023001', name: 'Tanaka, Taro', attendance: '98%' },
  { id: '2023002', name: 'Suzuki, Hanako', attendance: '95%' },
  { id: '2023003', name: 'Sato, Kenji', attendance: '65% (要確認)', flag: true },
  { id: '2023004', name: 'Watanabe, Yuki', attendance: '92%' },
];

const PromotionPage: NextPage = () => {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>(['2023001', '2023002', '2023004']);

  const handleToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    router.push('/promotion-success');
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>一括昇給・進級処理</h1>
          <p className={styles.subtitle}>次年度に向けた一括進級処理を行います。</p>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.iconBtn}><BellIcon /></button>
          <button className={styles.iconBtn}><UserCircleIcon /></button>
        </div>
      </div>

      {/* Stepper */}
      <div className={styles.stepperContainer}>
        <div className={styles.stepper}>
          <div className={styles.step}>
            <div className={`${styles.stepCircle} ${styles.stepCircleDone}`}>
              <CheckIcon />
            </div>
            <span className={styles.stepLabel}>1. 設定</span>
          </div>
          <div className={`${styles.stepLine} ${styles.stepLineDone}`} />
          <div className={styles.step}>
            <div className={`${styles.stepCircle} ${styles.stepCircleActive}`}>2</div>
            <span className={`${styles.stepLabel} ${styles.stepLabelActive}`}>2. プレビュー・編集</span>
          </div>
          <div className={styles.stepLine} />
          <div className={styles.step}>
            <div className={styles.stepCircle}>3</div>
            <span className={styles.stepLabel}>3. 実行</span>
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      <div className={styles.warningBanner}>
        <AlertIcon />
        <div>
          <div className={styles.warningTitle}>警告: 取り消し不能な操作</div>
          <div className={styles.warningText}>
            この進級処理を実行すると、生徒の記録が次年度向けに完全に更新されます。確定前に変更内容をよくご確認ください。
          </div>
        </div>
      </div>

      {/* Columns */}
      <div className={styles.mainGrid}>
        {/* Left Column: Current */}
        <div className={styles.columnCard}>
          <div className={styles.columnHeader}>
            <span className={styles.columnTitle}>現在のクラス</span>
            <span className={styles.yearLabel}>(2023年度)</span>
            <span className={styles.classBadge}>1-A</span>
          </div>

          <div className={styles.studentList}>
            {initialStudents.map((s) => {
              const isChecked = selectedIds.includes(s.id);
              return (
                <div key={s.id} className={styles.studentRow}>
                  <label className={styles.checkboxContainer}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggle(s.id)}
                    />
                    <span className={styles.checkmark} />
                  </label>
                  <div className={styles.studentDetails}>
                    <div className={styles.studentName}>{s.name}</div>
                    <div className={styles.studentMeta}>
                      <span>ID: {s.id}</span>
                      <span className={styles.dotSeparator}>•</span>
                      <span className={s.flag ? styles.flagText : ''}>
                        出席率: {s.attendance}
                      </span>
                      {s.flag && <span className={styles.flagIcon}><RedFlagIcon /></span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column transition indicator */}
        <div className={styles.transitionCol}>
          <div className={styles.transitionCircle}>›</div>
        </div>

        {/* Right Column: Preview */}
        <div className={styles.columnCard}>
          <div className={styles.columnHeader}>
            <span className={styles.columnTitle}>次年度クラスのプレビュー</span>
            <span className={styles.yearLabel}>(2024年度)</span>
            <select className={styles.classSelect}>
              <option>2-A</option>
              <option>2-B</option>
            </select>
          </div>

          <div className={styles.studentList}>
            {initialStudents.map((s) => {
              const isSelected = selectedIds.includes(s.id);
              if (isSelected) {
                return (
                  <div key={s.id} className={styles.previewRow}>
                    <div className={styles.barIndicatorActive} />
                    <div className={styles.previewDetails}>
                      <div className={styles.previewName}>{s.name}</div>
                      <div className={styles.previewMeta}>進級先: <strong style={{ color: '#dc2626' }}>2-A</strong></div>
                    </div>
                    <span className={styles.readyBadge}>準備完了</span>
                  </div>
                );
              } else {
                return (
                  <div key={s.id} className={`${styles.previewRow} ${styles.previewRowDisabled}`}>
                    <div className={styles.barIndicatorDisabled} />
                    <div className={styles.previewDetails}>
                      <div className={styles.previewNameDisabled}>{s.name}</div>
                      <div className={styles.previewMeta}>ステータス: 対象外</div>
                    </div>
                  </div>
                );
              }
            })}
          </div>

          <div className={styles.columnFooter}>
            <span>進級対象を選択済み:</span>
            <strong className={styles.footerCount}>{selectedIds.length} / 4</strong>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className={styles.actionsRow}>
        <button
          className={styles.cancelBtn}
          onClick={() => router.push('/')}
        >
          キャンセル
        </button>
        <button
          className={styles.submitBtn}
          onClick={handleConfirm}
        >
          進級処理を確定・実行する ▷
        </button>
      </div>
    </div>
  );
};

export default PromotionPage;

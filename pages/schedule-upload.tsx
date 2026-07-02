import type { NextPage } from 'next';
import Link from 'next/link';
import { useState } from 'react';
import styles from '../styles/ScheduleUpload.module.css';

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

function CloudUploadIcon() {
  return (
    <svg width="32" height="32" fill="none" stroke="#dc2626" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
    </svg>
  );
}

const ScheduleUploadPage: NextPage = () => {
  const [manualMode, setManualMode] = useState(false);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>2024年度 前期 時間割一括登録</h1>
          <p className={styles.subtitle}>学期全体の授業をまとめて設定します</p>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.iconBtn}><BellIcon /></button>
          <button className={styles.iconBtn}><UserCircleIcon /></button>
        </div>
      </div>

      <div className={styles.body}>
        {/* Left Column */}
        <div className={styles.leftCol}>
          {/* Stepper Card */}
          <div className={styles.stepperCard}>
            <div className={styles.stepRow}>
              <div className={styles.stepCircle}>1</div>
              <span className={styles.stepText}>基本情報設定</span>
            </div>
            <div className={styles.stepLine} />
            <div className={styles.stepRow}>
              <div className={`${styles.stepCircle} ${styles.stepCircleActive}`}>2</div>
              <span className={`${styles.stepText} ${styles.stepTextActive}`}>授業データ読み込み</span>
            </div>
            <div className={styles.stepLine} />
            <div className={styles.stepRow}>
              <div className={styles.stepCircle}>3</div>
              <span className={styles.stepText}>配置確認・調整</span>
            </div>
          </div>

          {/* Upload Card */}
          <div className={styles.uploadCard}>
            <CloudUploadIcon />
            <div className={styles.uploadTitle}>CSVファイルをドロップ</div>
            <div className={styles.uploadSubtitle}>または、クリックしてファイルを選択</div>
            <button className={styles.uploadBtn} onClick={() => alert('ファイルをアップロードします')}>
              Upload
            </button>
            <button className={styles.downloadLink} onClick={() => alert('テンプレートをダウンロードします')}>
              Download Template
            </button>
          </div>

          {/* Toggle mode */}
          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>手動入力モード</span>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={manualMode}
                onChange={() => setManualMode(!manualMode)}
              />
              <span className={styles.slider} />
            </label>
          </div>
        </div>

        {/* Right Column */}
        <div className={styles.rightCol}>
          <div className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <h2 className={styles.previewTitle}>配置確認プレビュー</h2>
              <span className={styles.badge}>※ドラッグで調整可能</span>
            </div>

            <div className={styles.previewTable}>
              {/* Day headers */}
              <div className={styles.tableRow}>
                <div className={styles.timeHeaderCell} />
                <div className={styles.dayHeader}>月</div>
                <div className={styles.dayHeader}>火</div>
                <div className={styles.dayHeader}>水</div>
                <div className={styles.dayHeader}>木</div>
                <div className={styles.dayHeader}>金</div>
              </div>

              {/* 1限 row */}
              <div className={styles.tableRow}>
                <div className={styles.periodCell}>1限</div>
                <div className={styles.gridCellEmpty}>空き</div>
                <div className={styles.gridCellClass}>
                  <strong>グラミング基</strong>
                  <span>1教室・山田先...</span>
                </div>
                <div className={styles.gridCellEmpty}>空き</div>
                <div className={styles.gridCellClass}>
                  <strong>/ebデザイン</strong>
                  <span>5教室・佐藤先...</span>
                </div>
                <div className={styles.gridCellEmpty}>空き</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className={styles.actionBar}>
        <Link href="/schedule-detail" className={styles.cancelBtn}>
          Cancel
        </Link>
        <button
          className={styles.saveBtn}
          onClick={() => alert('時間割を登録しました')}
        >
          Save and Publish Schedule
        </button>
      </div>
    </div>
  );
};

export default ScheduleUploadPage;

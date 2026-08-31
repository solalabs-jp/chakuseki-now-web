import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import styles from '../styles/PromotionSuccess.module.css';
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

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function BigCheckIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  );
}

const PromotionSuccessPage: NextPage = () => {
  const router = useRouter();

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>一括進級処理</h1>
          <p className={styles.subtitle}>学生の進級データを確定し、新しい学年・クラスへ反映しました。</p>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.iconBtn}><BellIcon /></button>
          <UserProfileButton />
        </div>
      </div>

      {/* Stepper */}
      <div className={styles.stepperContainer}>
        <div className={styles.stepper}>
          <div className={styles.step}>
            <div className={`${styles.stepCircle} ${styles.stepCircleDone}`}>
              <CheckIcon />
            </div>
            <span className={styles.stepLabelActive}>Step 1: 設定</span>
          </div>
          <div className={`${styles.stepLine} ${styles.stepLineDone}`} />
          <div className={styles.step}>
            <div className={`${styles.stepCircle} ${styles.stepCircleDone}`}>
              <CheckIcon />
            </div>
            <span className={styles.stepLabelActive}>Step 2: 確認</span>
          </div>
          <div className={`${styles.stepLine} ${styles.stepLineDone}`} />
          <div className={styles.step}>
            <div className={`${styles.stepCircle} ${styles.stepCircleActive}`}>3</div>
            <span className={`${styles.stepLabelActive} ${styles.stepLabelRed}`}>Step 3: 完了</span>
          </div>
        </div>
      </div>

      {/* Success Box */}
      <div className={styles.successBox}>
        <div className={styles.successIconCircle}>
          <BigCheckIcon />
        </div>
        <h2 className={styles.successTitle}>進級処理が正常に完了しました</h2>
        <p className={styles.successDescription}>
          選択された学生の進級データがシステムに反映されました。新しいクラス名簿は即時利用可能です。
        </p>

        {/* Results Card */}
        <div className={styles.resultsCard}>
          <div className={styles.cardTitle}>処理結果サマリー</div>
          <div className={styles.resultsRow}>
            <span>対象学生数:</span>
            <strong>124 名</strong>
          </div>
          <div className={styles.resultsRow}>
            <span>成功:</span>
            <strong style={{ color: '#10b981' }}>124 名</strong>
          </div>
          <div className={styles.resultsRow}>
            <span>失敗:</span>
            <strong>0 名</strong>
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className={styles.actionsRow}>
        <button className={styles.outlineBtn} onClick={() => alert('ログをダウンロードします')}>
          <DownloadIcon />
          実行ログをダウンロード (CSV)
        </button>
        <button className={styles.outlineBlueBtn} onClick={() => router.push('/class')}>
          <DocumentIcon />
          新クラス名簿を確認
        </button>
        <button className={styles.primaryRedBtn} onClick={() => router.push('/')}>
          ダッシュボードへ戻る
        </button>
      </div>
    </div>
  );
};

export default PromotionSuccessPage;

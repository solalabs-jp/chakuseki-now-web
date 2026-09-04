import { useEffect, useState } from 'react';
import type { NextPage } from 'next';
import type { ReactElement } from 'react';
import styles from '../styles/Monitor.module.css';

function QRCodeSVG() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      {/* Finder pattern TL */}
      <rect x="8" y="8" width="28" height="28" fill="none" stroke="#111" strokeWidth="3" />
      <rect x="15" y="15" width="14" height="14" fill="#111" />
      {/* Finder pattern TR */}
      <rect x="84" y="8" width="28" height="28" fill="none" stroke="#111" strokeWidth="3" />
      <rect x="91" y="15" width="14" height="14" fill="#111" />
      {/* Finder pattern BL */}
      <rect x="8" y="84" width="28" height="28" fill="none" stroke="#111" strokeWidth="3" />
      <rect x="15" y="91" width="14" height="14" fill="#111" />
      {/* Data dots */}
      {[46, 52, 58, 64, 70, 76].map((x) =>
        [8, 14, 20, 26, 32, 38, 44, 50, 56, 62, 68, 74, 80, 86, 92, 98, 104]
          .filter((y) => ((x * 7 + y * 13) % 10) > 4)
          .map((y) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="5" height="5" fill="#111" />
          ))
      )}
      {/* Extra deterministic dots for QR look */}
      {[[44, 8], [50, 8], [56, 14], [62, 8], [68, 14], [74, 8],
      [44, 20], [56, 26], [68, 20], [74, 26],
      [44, 32], [50, 26], [62, 32], [74, 32],
      [44, 44], [50, 50], [56, 44], [68, 44], [74, 50], [80, 44],
      [44, 56], [56, 56], [62, 50], [68, 56], [80, 56],
      [44, 62], [50, 68], [56, 62], [68, 62], [74, 68], [80, 62],
      [44, 74], [62, 74], [74, 74], [80, 80],
      [44, 86], [50, 80], [56, 86], [62, 80], [68, 86],
      [50, 92], [56, 98], [68, 92], [74, 86], [80, 92], [86, 80],
      [50, 104], [62, 104], [74, 98], [80, 104], [86, 92], [92, 86],
      ].map(([x, y]) => (
        <rect key={`d-${x}-${y}`} x={x} y={y} width="5" height="5" fill="#111" />
      ))}
    </svg>
  );
}

const DEFAULT_QUESTION = "最近気になっている\nWeb技術はなんですか？";

const MonitorPage: NextPage & { getLayout: (page: ReactElement) => ReactElement } = () => {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [questionText, setQuestionText] = useState(DEFAULT_QUESTION);

  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('monitorQuestion');
    if (saved) {
      setQuestionText(saved);
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'monitorQuestion' && e.newValue) {
        setQuestionText(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('monitor_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'UPDATE_QUESTION' && event.data.question) {
          setQuestionText(event.data.question);
        }
      };
    } catch { }

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (bc) bc.close();
    };
  }, []);

  const timeStr = mounted && now ? now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
  const dateStr = mounted && now ? now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  return (
    <div className={styles.page}>
      {/* Logo */}
      <div className={styles.logo}>
        <div className={styles.logoIcon}>着</div>
        <div className={styles.logoText}>
          <strong>着席なう</strong>
          <span>Classroom Projection</span>
        </div>
      </div>

      {/* Center content */}
      <div className={styles.center}>
        <div className={styles.questionBadge}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
          本日のお題 (Question of the Day)
        </div>
        <h1 className={styles.questionText}>
          {questionText}
        </h1>
        <p className={styles.instruction}>
          着席登録時に、この質問に対する回答を入力してください。<br />
          (Please answer this question when you check in.)
        </p>
      </div>

      {/* Bottom */}
      <div className={styles.bottom}>
        <div className={styles.clock}>
          <div className={styles.clockTime}>{timeStr}</div>
          <div className={styles.clockDate}>{dateStr}</div>
        </div>
        <div className={styles.qrArea}>
          <div className={styles.qrBox}>
            <QRCodeSVG />
          </div>
          <div className={styles.qrLabel}>
            <span>スキャンして着席登録</span>
            <span className={styles.qrSub}>Scan to Check-in</span>
          </div>
        </div>
      </div>
    </div>
  );
};

MonitorPage.getLayout = (page: ReactElement) => page;

export default MonitorPage;

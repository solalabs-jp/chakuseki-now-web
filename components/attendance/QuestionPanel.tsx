import styles from '../../styles/Attendance.module.css';
import { PaperclipIcon } from './icons';

type QuestionPanelProps = {
  question: string;
  onQuestionChange: (value: string) => void;
  isSent: boolean;
  onSend: () => void;
};

export default function QuestionPanel({ question, onQuestionChange, isSent, onSend }: QuestionPanelProps) {
  return (
    <div className={styles.questionPanel}>
      <div className={styles.questionPanelTitle}>
        <svg width="14" height="14" fill="none" stroke="#dc2626" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
        <span>生徒への質問送信</span>
      </div>
      <label className={styles.fieldLabel}>お題・アンケート内容</label>
      <textarea
        className={styles.textarea}
        placeholder="例：質問内容を記述"
        value={question}
        onChange={(e) => onQuestionChange(e.target.value)}
      />
      <div className={styles.questionActions}>
        <button className={styles.attachBtn}>
          <PaperclipIcon />
          添付
        </button>
        <button className={styles.monitorDisplayBtn} onClick={onSend}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
          {isSent ? 'モニターに反映完了！' : 'モニターに表示'}
        </button>
      </div>
    </div>
  );
}

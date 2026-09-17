import { useRef } from 'react';
import styles from '../../styles/Attendance.module.css';
import { PaperclipIcon } from './icons';

type QuestionPanelProps = {
  question: string;
  onQuestionChange: (value: string) => void;
  isSent: boolean;
  onSend: () => void;
  attachedImage: string | null;
  attachedImageName: string | null;
  onAttachImage: (dataUrl: string, name: string) => void;
  onRemoveImage: () => void;
};

export default function QuestionPanel({
  question,
  onQuestionChange,
  isSent,
  onSend,
  attachedImage,
  attachedImageName,
  onAttachImage,
  onRemoveImage,
}: QuestionPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('画像ファイルを選択してください。');
        e.target.value = '';
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        alert('ファイルサイズが大きすぎます。2MB以下の画像を選択してください。');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        onAttachImage(ev.target?.result as string, file.name);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

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
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          ref={fileInputRef}
          onChange={handleFileChange}
        />
        <button className={styles.attachBtn} onClick={() => fileInputRef.current?.click()}>
          <PaperclipIcon />
          添付
        </button>
        <button className={styles.monitorDisplayBtn} onClick={onSend}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
          {isSent ? 'モニターに反映完了！' : 'モニターに表示'}
        </button>
      </div>
      {attachedImage && (
        <div className={styles.fileNameWrapper}>
          <PaperclipIcon />
          <span className={styles.fileNameText}>{attachedImageName || '添付画像'}</span>
          <button className={styles.removeFileBtn} onClick={onRemoveImage}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

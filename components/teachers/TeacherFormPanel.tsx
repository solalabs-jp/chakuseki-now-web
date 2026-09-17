import styles from '../../styles/Attendance.module.css';
import { formatBeaconId } from '../../lib/beaconId';
import type { ClassOption, FormState } from './types';

type TeacherFormPanelProps = {
  open: boolean;
  editingId: string | null;
  form: FormState;
  classes: ClassOption[];
  saving: boolean;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onClassIdChange: (value: string) => void;
  onBeaconIdChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export default function TeacherFormPanel({
  open,
  editingId,
  form,
  classes,
  saving,
  onNameChange,
  onEmailChange,
  onClassIdChange,
  onBeaconIdChange,
  onCancel,
  onSave,
}: TeacherFormPanelProps) {
  if (!open) return null;

  return (
    <div className={styles.userPanelOverlay} onClick={onCancel}>
      <div className={styles.userPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.userPanelHeader}>
          <div className={styles.userAvatarLarge}>
            {form.name ? form.name.slice(0, 1) : '教'}
          </div>
          <div>
            <div className={styles.userPanelName}>
              {editingId ? '教員情報を編集' : '新規教員を追加'}
            </div>
            <div className={styles.userPanelRole}>教員・BLE設定</div>
          </div>
        </div>

        <div className={styles.userPanelBody}>
          <label className={styles.fieldLabel}>氏名</label>
          <input
            className={styles.formInput}
            value={form.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="例: 根本 康太"
          />

          <label className={styles.fieldLabel}>メールアドレス</label>
          <input
            className={styles.formInput}
            value={form.email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="teacher001@example.com"
          />

          <label className={styles.fieldLabel}>担任クラス</label>
          <select
            className={styles.formInput}
            value={form.classId}
            onChange={(e) => onClassIdChange(e.target.value)}
          >
            <option value="">未設定</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <label className={styles.fieldLabel}>BLEビーコンID</label>
          <input
            className={styles.formInput}
            value={form.beaconId}
            onChange={(e) => onBeaconIdChange(formatBeaconId(e.target.value))}
            placeholder="01020304-0506-0708-090A-0B0C0D0E0F10"
            maxLength={36}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={styles.userPanelButton}
            style={{ background: '#fff', color: '#374151', border: '1px solid #e5e7eb', flex: 1 }}
            onClick={onCancel}
          >
            キャンセル
          </button>
          <button
            className={styles.userPanelButton}
            style={{ flex: 1 }}
            onClick={onSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}

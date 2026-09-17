import attendanceStyles from '../../styles/Attendance.module.css';
import { DAYS, type ApiPeriod, type Teacher } from './types';

type AddScheduleFormProps = {
  open: boolean;
  className: string;
  periods: ApiPeriod[];
  teachers: Teacher[];
  dayIdx: number;
  onDayIdxChange: (value: number) => void;
  periodId: string;
  onPeriodIdChange: (value: string) => void;
  subject: string;
  onSubjectChange: (value: string) => void;
  teacherId: string;
  onTeacherIdChange: (value: string) => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
};

export default function AddScheduleForm({
  open,
  className,
  periods,
  teachers,
  dayIdx,
  onDayIdxChange,
  periodId,
  onPeriodIdChange,
  subject,
  onSubjectChange,
  teacherId,
  onTeacherIdChange,
  saving,
  onCancel,
  onSubmit,
}: AddScheduleFormProps) {
  if (!open) return null;

  return (
    <div className={attendanceStyles.userPanelOverlay} onClick={onCancel}>
      <div className={attendanceStyles.userPanel} onClick={(e) => e.stopPropagation()}>
        <div className={attendanceStyles.userPanelHeader}>
          <div className={attendanceStyles.userAvatarLarge}>時</div>
          <div>
            <div className={attendanceStyles.userPanelName}>新規授業を追加</div>
            <div className={attendanceStyles.userPanelRole}>{className}</div>
          </div>
        </div>

        <div className={attendanceStyles.userPanelBody}>
          <label className={attendanceStyles.fieldLabel}>曜日</label>
          <select
            className={attendanceStyles.formInput}
            value={dayIdx}
            onChange={(e) => onDayIdxChange(Number(e.target.value))}
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>{d}曜日</option>
            ))}
          </select>

          <label className={attendanceStyles.fieldLabel}>時限</label>
          <select
            className={attendanceStyles.formInput}
            value={periodId}
            onChange={(e) => onPeriodIdChange(e.target.value)}
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>

          <label className={attendanceStyles.fieldLabel}>科目名</label>
          <input
            className={attendanceStyles.formInput}
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="例: ITマネジメント"
          />

          <label className={attendanceStyles.fieldLabel}>担当教員</label>
          <select
            className={attendanceStyles.formInput}
            value={teacherId}
            onChange={(e) => onTeacherIdChange(e.target.value)}
          >
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={attendanceStyles.userPanelButton}
            style={{ background: '#fff', color: '#374151', border: '1px solid #e5e7eb', flex: 1 }}
            onClick={onCancel}
          >
            キャンセル
          </button>
          <button
            className={attendanceStyles.userPanelButton}
            style={{ flex: 1 }}
            onClick={onSubmit}
            disabled={saving || !subject.trim() || !teacherId || !periodId}
          >
            {saving ? '保存中...' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  );
}

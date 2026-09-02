import type { NextPage } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/ScheduleDetail.module.css';
import attendanceStyles from '../styles/Attendance.module.css';
import UserProfileButton from '../components/UserProfileButton';


function BellIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="#6b7280" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" fill="none" stroke="#dc2626" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="#d1d5db" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  );
}

type ClassCell = {
  scheduleId: string;
  period: string;
  subject: string;
  teacher: string;
  room: string;
} | null;

type ApiSchedule = {
  scheduleId: string;
  subject: string;
  teacher: string;
  dayOfWeek: number;
  period: number;
  periodLabel: string;
};

type ApiPeriod = {
  id: string;
  period: number;
  label: string;
};

type Teacher = {
  id: string;
  name: string;
};

const days = ['月', '火', '水', '木', '金'];

const ScheduleDetailPage: NextPage = () => {
  const router = useRouter();
  const classId = typeof router.query.classId === 'string' ? router.query.classId : 'class-2A';

  const [className, setClassName] = useState('');
  const [periods, setPeriods] = useState<ApiPeriod[]>([]);
  const [timetable, setTimetable] = useState<ClassCell[][]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formDayIdx, setFormDayIdx] = useState(0);
  const [formPeriodId, setFormPeriodId] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formTeacherId, setFormTeacherId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTimetable = () => {
    setLoading(true);
    fetch(`/api/timetable/detail?classId=${encodeURIComponent(classId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setClassName(data.className);

        const apiPeriods: ApiPeriod[] = data.periods;
        setPeriods(apiPeriods);

        const schedules: ApiSchedule[] = data.schedules;
        const grid: ClassCell[][] = apiPeriods.map(() =>
          Array.from({ length: days.length }, () => null)
        );

        for (const s of schedules) {
          const rowIdx = apiPeriods.findIndex((p) => p.period === s.period);
          const colIdx = s.dayOfWeek - 1; // dayOfWeek: 1=月...5=金
          if (rowIdx < 0 || colIdx < 0 || colIdx >= days.length) continue;
          grid[rowIdx][colIdx] = {
            scheduleId: s.scheduleId,
            period: s.periodLabel,
            subject: s.subject,
            teacher: s.teacher,
            room: '',
          };
        }

        setTimetable(grid);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(loadTimetable, [classId]);

  useEffect(() => {
    fetch('/api/teachers')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) return;
        setTeachers(data.teachers);
      })
      .catch(() => {});
  }, []);

  const openAddForm = (dayIdx: number, periodId?: string) => {
    setFormDayIdx(dayIdx);
    setFormPeriodId(periodId ?? periods[0]?.id ?? '');
    setFormSubject('');
    setFormTeacherId(teachers[0]?.id ?? '');
    setFormOpen(true);
  };

  const closeForm = () => setFormOpen(false);

  const handleCreate = async () => {
    if (!formPeriodId || !formSubject.trim() || !formTeacherId) return;
    setSaving(true);
    try {
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
          periodId: formPeriodId,
          subjectName: formSubject,
          dayOfWeek: formDayIdx + 1,
          defaultTeacherId: formTeacherId,
        }),
      });
      closeForm();
      loadTimetable();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    if (!window.confirm('この授業をコマ表から削除しますか？')) return;
    try {
      await fetch(`/api/schedules/${encodeURIComponent(scheduleId)}`, { method: 'DELETE' });
      loadTimetable();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>時間割登録</h1>
          <p className={styles.subtitle}>
            {loading ? '読み込み中...' : error ? `データ取得エラー: ${error}` : className}
          </p>
        </div>
        <div className={styles.headerRight}>
          <Link href="/schedule-upload" className={styles.outlineBtn}>
            + 一括追加
          </Link>
          <button className={styles.primaryBtn} onClick={() => openAddForm(0)}>
            + 新規授業追加
          </button>
          <button className={styles.iconBtn}><BellIcon /></button>
          <UserProfileButton />
        </div>
      </div>

      {/* Weekly grid */}
      <div className={styles.gridWrap}>
        {/* Day headers */}
        <div className={styles.gridRow}>
          <div className={styles.emptyCell} />
          {days.map((d) => (
            <div key={d} className={styles.dayHeader}>{d}</div>
          ))}
        </div>

        {/* Timetable rows */}
        {timetable.map((row, rowIdx) => (
          <div key={periods[rowIdx]?.id ?? rowIdx} className={styles.gridRow}>
            <div className={styles.periodLabel}>{periods[rowIdx]?.period ?? rowIdx + 1}限</div>
            {row.map((cell, colIdx) => (
              <div key={colIdx} className={styles.cell}>
                {cell ? (
                  <div className={styles.classCard}>
                    <div className={styles.cardTopRow}>
                      <span className={styles.periodBadge}>{cell.period}</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(cell.scheduleId)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        aria-label="この授業を削除"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <div className={styles.cardSubject}>{cell.subject}</div>
                    <div className={styles.cardMeta}>
                      <PersonIcon />
                      <span>{cell.teacher}</span>
                    </div>
                    {cell.room && (
                      <div className={styles.cardMeta}>
                        <LocationIcon />
                        <span>{cell.room}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    className={styles.emptyCell2}
                    onClick={() => openAddForm(colIdx, periods[rowIdx]?.id)}
                  >
                    <PlusIcon />
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Add schedule form */}
      {formOpen && (
        <div className={attendanceStyles.userPanelOverlay} onClick={closeForm}>
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
                className={attendanceStyles.searchInput}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}
                value={formDayIdx}
                onChange={(e) => setFormDayIdx(Number(e.target.value))}
              >
                {days.map((d, i) => (
                  <option key={d} value={i}>{d}曜日</option>
                ))}
              </select>

              <label className={attendanceStyles.fieldLabel}>時限</label>
              <select
                className={attendanceStyles.searchInput}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}
                value={formPeriodId}
                onChange={(e) => setFormPeriodId(e.target.value)}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>

              <label className={attendanceStyles.fieldLabel}>科目名</label>
              <input
                className={attendanceStyles.searchInput}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                placeholder="例: ITマネジメント"
              />

              <label className={attendanceStyles.fieldLabel}>担当教員</label>
              <select
                className={attendanceStyles.searchInput}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}
                value={formTeacherId}
                onChange={(e) => setFormTeacherId(e.target.value)}
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
                onClick={closeForm}
              >
                キャンセル
              </button>
              <button
                className={attendanceStyles.userPanelButton}
                style={{ flex: 1 }}
                onClick={handleCreate}
                disabled={saving || !formSubject.trim() || !formTeacherId || !formPeriodId}
              >
                {saving ? '保存中...' : '追加する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleDetailPage;

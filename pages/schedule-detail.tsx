import type { NextPage } from 'next';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/ScheduleDetail.module.css';
import UserProfileButton from '../components/UserProfileButton';
import AddScheduleForm from '../components/schedule-detail/AddScheduleForm';
import TimetableGrid from '../components/schedule-detail/TimetableGrid';
import { BellIcon } from '../components/schedule-detail/icons';
import { useScheduleDetailData } from '../lib/useScheduleDetailData';

const ScheduleDetailPage: NextPage = () => {
  const router = useRouter();
  const classId = typeof router.query.classId === 'string' ? router.query.classId : 'class-2A';

  const { className, periods, timetable, teachers, loading, error, createSchedule, deleteSchedule } =
    useScheduleDetailData(classId);

  const [formOpen, setFormOpen] = useState(false);
  const [formDayIdx, setFormDayIdx] = useState(0);
  const [formPeriodId, setFormPeriodId] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formTeacherId, setFormTeacherId] = useState('');
  const [saving, setSaving] = useState(false);

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
    const ok = await createSchedule({
      periodId: formPeriodId,
      subjectName: formSubject,
      dayOfWeek: formDayIdx + 1,
      defaultTeacherId: formTeacherId,
    });
    setSaving(false);
    if (ok) closeForm();
  };

  const handleDelete = (scheduleId: string) => {
    if (!window.confirm('この授業をコマ表から削除しますか？')) return;
    deleteSchedule(scheduleId);
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

      <TimetableGrid
        periods={periods}
        timetable={timetable}
        onAddCell={openAddForm}
        onDeleteCell={handleDelete}
      />

      <AddScheduleForm
        open={formOpen}
        className={className}
        periods={periods}
        teachers={teachers}
        dayIdx={formDayIdx}
        onDayIdxChange={setFormDayIdx}
        periodId={formPeriodId}
        onPeriodIdChange={setFormPeriodId}
        subject={formSubject}
        onSubjectChange={setFormSubject}
        teacherId={formTeacherId}
        onTeacherIdChange={setFormTeacherId}
        saving={saving}
        onCancel={closeForm}
        onSubmit={handleCreate}
      />
    </div>
  );
};

export default ScheduleDetailPage;

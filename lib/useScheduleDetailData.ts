import { useEffect, useState } from 'react';
import { authHeaders } from './clientAuth';
import { DAYS, type ApiPeriod, type ApiSchedule, type ClassCell, type Teacher } from '../components/schedule-detail/types';

type CreateScheduleInput = {
  periodId: string;
  subjectName: string;
  dayOfWeek: number;
  defaultTeacherId: string;
};

/** schedule-detail ページのデータ取得・作成・削除をまとめたフック。 */
export function useScheduleDetailData(classId: string) {
  const [className, setClassName] = useState('');
  const [periods, setPeriods] = useState<ApiPeriod[]>([]);
  const [timetable, setTimetable] = useState<ClassCell[][]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTimetable = () => {
    setLoading(true);
    setError(null);
    fetch(`/api/timetable/detail?classId=${encodeURIComponent(classId)}`, { headers: authHeaders() })
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
          Array.from({ length: DAYS.length }, () => null)
        );

        for (const s of schedules) {
          const rowIdx = apiPeriods.findIndex((p) => p.period === s.period);
          const colIdx = s.dayOfWeek - 1; // dayOfWeek: 1=月...5=金
          if (rowIdx < 0 || colIdx < 0 || colIdx >= DAYS.length) continue;
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
    fetch('/api/teachers', { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setTeachers(data.teachers);
      })
      .catch(() => setError('教員一覧の取得に失敗しました'));
  }, []);

  const createSchedule = async (input: CreateScheduleInput): Promise<boolean> => {
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ classId, ...input }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `保存に失敗しました (${res.status})`);
        return false;
      }

      loadTimetable();
      return true;
    } catch (err) {
      setError(String(err));
      return false;
    }
  };

  const deleteSchedule = async (scheduleId: string) => {
    try {
      const res = await fetch(`/api/schedules/${encodeURIComponent(scheduleId)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `削除に失敗しました (${res.status})`);
        return;
      }

      loadTimetable();
    } catch (err) {
      setError(String(err));
    }
  };

  return {
    className,
    periods,
    timetable,
    teachers,
    loading,
    error,
    createSchedule,
    deleteSchedule,
  };
}

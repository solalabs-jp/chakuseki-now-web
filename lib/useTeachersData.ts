import { useEffect, useState } from 'react';
import { authHeaders } from './clientAuth';
import { emptyForm, type ClassOption, type FormState, type Teacher } from '../components/teachers/types';

/** 教員一覧の取得・作成/更新・削除をまとめたフック。 */
export function useTeachersData() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTeachers = () => {
    setLoading(true);
    setError(null);
    fetch('/api/teachers', { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setTeachers(data.teachers);
        setClasses(data.classes);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTeachers();
  }, []);

  /**
   * editingId が無ければ新規作成、あれば更新。更新時は editingBase と
   * 比較して変更されたフィールドだけを PATCH で送る(email を毎回送ると
   * サーバー側で不要な admin.auth().updateUser が走るため)。
   */
  const saveTeacher = async (
    editingId: string | null,
    form: FormState,
    editingBase: FormState | null
  ): Promise<boolean> => {
    try {
      let res: Response;
      if (editingId) {
        const base = editingBase ?? emptyForm;
        const patch: Partial<FormState> = {};
        (Object.keys(form) as (keyof FormState)[]).forEach((key) => {
          if (form[key] !== base[key]) patch[key] = form[key];
        });

        if (Object.keys(patch).length === 0) {
          return true;
        }

        res = await fetch(`/api/teachers/${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(patch),
        });
      } else {
        res = await fetch('/api/teachers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(form),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `保存に失敗しました (${res.status})`);
        return false;
      }

      loadTeachers();
      return true;
    } catch (err) {
      setError(String(err));
      return false;
    }
  };

  const deleteTeacher = async (teacher: Teacher) => {
    try {
      const res = await fetch(`/api/teachers/${encodeURIComponent(teacher.id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `削除に失敗しました (${res.status})`);
        return;
      }

      loadTeachers();
    } catch (err) {
      setError(String(err));
    }
  };

  return { teachers, classes, loading, error, saveTeacher, deleteTeacher };
}

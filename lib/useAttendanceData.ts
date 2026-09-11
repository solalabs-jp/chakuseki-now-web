import { useEffect, useRef, useState } from 'react';
import { authHeaders } from './clientAuth';
import type { AttendanceStats, RealtimeStudent } from '../components/attendance/types';

/**
 * 出席管理ページの「LIVE」表示に対応する実データ取得。専用の購読 API が
 * 無いのでポーリングする。出席リスト(realtime)は素早く反映したいので
 * 短間隔、上部の集計(stats)は変化が緩やかなうえ読み取りが重いので長間隔に
 * 分ける。タブが非表示の間は Firestore 読み取りを止め、復帰時に即座に
 * 取り直す。
 */
export function useAttendanceData(classId: string) {
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [students, setStudents] = useState<RealtimeStudent[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const LIST_REFRESH_MS = 4000;
    const STATS_REFRESH_MS = 30000;
    cancelledRef.current = false;

    const loadStudents = () => {
      fetch(`/api/attendance/realtime?classId=${encodeURIComponent(classId)}`, { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => {
          if (cancelledRef.current || data.error) return;
          setStudents(data.students);
        })
        .catch(() => {});
    };

    const loadStats = () => {
      fetch(`/api/attendance/stats?classId=${encodeURIComponent(classId)}`, { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => {
          if (cancelledRef.current || data.error) return;
          setStats(data);
        })
        .catch(() => {});
    };

    loadStudents();
    loadStats();

    const listTimer = setInterval(() => {
      if (document.visibilityState === 'visible') loadStudents();
    }, LIST_REFRESH_MS);

    const statsTimer = setInterval(() => {
      if (document.visibilityState === 'visible') loadStats();
    }, STATS_REFRESH_MS);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      loadStudents();
      loadStats();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelledRef.current = true;
      clearInterval(listTimer);
      clearInterval(statsTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [classId]);

  // 開発用: 出席履歴を1件削除する。
  const deleteRecord = (recordId: string) => {
    if (!window.confirm('この出席履歴を削除しますか？（開発用・元に戻せません）')) {
      return;
    }
    setDeletingId(recordId);
    fetch(`/api/attendance/${encodeURIComponent(recordId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          alert(`削除に失敗しました: ${data.error}`);
          return;
        }
        setStudents((prev) => prev.filter((s) => s.recordId !== recordId));
      })
      .catch(() => alert('削除に失敗しました'))
      .finally(() => setDeletingId(null));
  };

  return { stats, students, deletingId, deleteRecord };
}

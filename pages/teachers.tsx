import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import styles from '../styles/Attendance.module.css';
import homeStyles from '../styles/Home.module.css';
import UserProfileButton from '../components/UserProfileButton';

function BellIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="#6b7280" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  );
}

function BluetoothIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="#3b82f6" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6.5 6.5 11 11L12 23V1l5.5 5.5-11 11"/>
    </svg>
  );
}

type Teacher = {
  id: string;
  name: string;
  email: string;
  classId: string;
  className: string;
  beaconId: string;
};

type ClassOption = { id: string; name: string };

type FormState = {
  name: string;
  email: string;
  classId: string;
  beaconId: string;
};

const emptyForm: FormState = { name: '', email: '', classId: '', beaconId: '' };

// Formats a BLE beacon ID as a standard UUID (8-4-4-4-12) while typing, e.g.
// "01020304050607080910111213141516" -> "01020304-0506-0708-0910-111213141516".
function formatBeaconId(raw: string): string {
  const hex = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 32).toUpperCase();
  const groups = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].filter(Boolean);
  return groups.join('-');
}

const TeachersPage: NextPage = () => {
  const router = useRouter();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const loadTeachers = () => {
    setLoading(true);
    fetch('/api/teachers')
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

  const openCreatePanel = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPanelOpen(true);
  };

  const openEditPanel = (teacher: Teacher) => {
    setEditingId(teacher.id);
    setForm({
      name: teacher.name,
      email: teacher.email,
      classId: teacher.classId,
      beaconId: formatBeaconId(teacher.beaconId),
    });
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await fetch(`/api/teachers/${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      } else {
        await fetch('/api/teachers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      }
      closePanel();
      loadTeachers();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (teacher: Teacher) => {
    if (!window.confirm(`${teacher.name}さんを削除しますか？この操作は取り消せません。`)) {
      return;
    }
    try {
      await fetch(`/api/teachers/${encodeURIComponent(teacher.id)}`, { method: 'DELETE' });
      loadTeachers();
    } catch (err) {
      setError(String(err));
    }
  };

  const filteredTeachers = teachers.filter((t) => {
    const q = search.trim();
    if (!q) return true;
    return t.name.includes(q) || t.email.includes(q) || t.id.includes(q);
  });

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>教員・BLE管理</h1>
        </div>
        <div className={styles.headerRight}>
          <div className={homeStyles.tabGroup}>
            <button
              className={homeStyles.tab}
              onClick={() => router.push('/promotion')}
            >進級処理</button>
            <button className={`${homeStyles.tab} ${homeStyles.tabActive}`}>
              教員・BLE管理
            </button>
          </div>
          <button className={styles.iconBtn}><BellIcon /></button>
          <UserProfileButton />
        </div>
      </div>

      {/* List */}
      <div className={styles.listSection}>
        <div className={styles.listHeader}>
          <div className={styles.listTitleRow}>
            <span className={styles.listTitle}>教員一覧</span>
          </div>
          <div className={styles.listActions}>
            <div className={styles.searchBox}>
              <SearchIcon />
              <input
                className={styles.searchInput}
                placeholder="氏名・メールで検索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              className={styles.monitorDisplayBtn}
              onClick={openCreatePanel}
            >
              <PlusIcon />
              新規教員を追加
            </button>
          </div>
        </div>

        {loading && <p className={styles.commentNone}>読み込み中...</p>}
        {error && <p style={{ color: '#dc2626', fontSize: 12 }}>データ取得エラー: {error}</p>}

        {!loading && !error && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>教員ID</th>
                <th className={styles.th}>氏名</th>
                <th className={styles.th}>メールアドレス</th>
                <th className={styles.th}>担任クラス</th>
                <th className={styles.th}>BLEビーコンID</th>
                <th className={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {filteredTeachers.map((t) => (
                <tr key={t.id} className={styles.tr}>
                  <td className={styles.td}><span className={styles.idText}>{t.id}</span></td>
                  <td className={styles.td}>
                    <div className={styles.nameCell}>
                      <div className={styles.avatar} style={{ background: '#3b82f6' }}>
                        {t.name.slice(0, 1)}
                      </div>
                      <span className={styles.studentName}>{t.name}</span>
                    </div>
                  </td>
                  <td className={styles.td}><span className={styles.timeText}>{t.email}</span></td>
                  <td className={styles.td}><span className={styles.timeText}>{t.className || '未設定'}</span></td>
                  <td className={styles.td}>
                    <span className={styles.statusChip} style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                      <BluetoothIcon />
                      {t.beaconId ? formatBeaconId(t.beaconId) : '未登録'}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className={styles.monitorDisplayBtn}
                        style={{ background: '#fff', color: '#374151', border: '1px solid #e5e7eb' }}
                        onClick={() => openEditPanel(t)}
                      >
                        編集
                      </button>
                      <button
                        className={styles.monitorDisplayBtn}
                        style={{ background: '#fff', color: '#dc2626', border: '1px solid #fecaca' }}
                        onClick={() => handleDelete(t)}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit / create panel */}
      {panelOpen && (
        <div className={styles.userPanelOverlay} onClick={closePanel}>
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
                className={styles.searchInput}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例: 根本 康太"
              />

              <label className={styles.fieldLabel}>メールアドレス</label>
              <input
                className={styles.searchInput}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="teacher001@example.com"
              />

              <label className={styles.fieldLabel}>担任クラス</label>
              <select
                className={styles.searchInput}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}
                value={form.classId}
                onChange={(e) => setForm({ ...form, classId: e.target.value })}
              >
                <option value="">未設定</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <label className={styles.fieldLabel}>BLEビーコンID</label>
              <input
                className={styles.searchInput}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}
                value={form.beaconId}
                onChange={(e) => setForm({ ...form, beaconId: formatBeaconId(e.target.value) })}
                placeholder="01020304-0506-0708-090A-0B0C0D0E0F10"
                maxLength={36}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={styles.userPanelButton}
                style={{ background: '#fff', color: '#374151', border: '1px solid #e5e7eb', flex: 1 }}
                onClick={closePanel}
              >
                キャンセル
              </button>
              <button
                className={styles.userPanelButton}
                style={{ flex: 1 }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeachersPage;

import type { NextPage } from 'next';
import { useState } from 'react';
import styles from '../styles/Attendance.module.css';
import UserProfileButton from '../components/UserProfileButton';
import TeacherFormPanel from '../components/teachers/TeacherFormPanel';
import TeacherTable from '../components/teachers/TeacherTable';
import { BellIcon } from '../components/teachers/icons';
import { emptyForm, type FormState, type Teacher } from '../components/teachers/types';
import { formatBeaconId } from '../lib/beaconId';
import { useTeachersData } from '../lib/useTeachersData';

const TeachersPage: NextPage = () => {
  const { teachers, classes, loading, error, saveTeacher, deleteTeacher } = useTeachersData();
  const [search, setSearch] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBase, setEditingBase] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const openCreatePanel = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPanelOpen(true);
  };

  const openEditPanel = (teacher: Teacher) => {
    const base: FormState = {
      name: teacher.name,
      email: teacher.email,
      classId: teacher.classId,
      beaconId: formatBeaconId(teacher.beaconId),
    };
    setEditingId(teacher.id);
    setEditingBase(base);
    setForm(base);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingId(null);
    setEditingBase(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await saveTeacher(editingId, form, editingBase);
    setSaving(false);
    if (ok) closePanel();
  };

  const handleDelete = (teacher: Teacher) => {
    if (!window.confirm(`${teacher.name}さんを削除しますか？この操作は取り消せません。`)) {
      return;
    }
    deleteTeacher(teacher);
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
          <button className={styles.iconBtn}><BellIcon /></button>
          <UserProfileButton />
        </div>
      </div>

      <TeacherTable
        teachers={filteredTeachers}
        loading={loading}
        error={error}
        search={search}
        onSearchChange={setSearch}
        onOpenCreate={openCreatePanel}
        onEdit={openEditPanel}
        onDelete={handleDelete}
      />

      <TeacherFormPanel
        open={panelOpen}
        editingId={editingId}
        form={form}
        classes={classes}
        saving={saving}
        onNameChange={(name) => setForm({ ...form, name })}
        onEmailChange={(email) => setForm({ ...form, email })}
        onClassIdChange={(classId) => setForm({ ...form, classId })}
        onBeaconIdChange={(beaconId) => setForm({ ...form, beaconId })}
        onCancel={closePanel}
        onSave={handleSave}
      />
    </div>
  );
};

export default TeachersPage;

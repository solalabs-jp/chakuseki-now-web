import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import UserProfileButton from '../components/UserProfileButton';
import AttendanceGauge from '../components/attendance/AttendanceGauge';
import QuestionPanel from '../components/attendance/QuestionPanel';
import RealtimeAttendanceTable from '../components/attendance/RealtimeAttendanceTable';
import { BellIcon } from '../components/attendance/icons';
import { useAttendanceData } from '../lib/useAttendanceData';
import styles from '../styles/Attendance.module.css';

const CLASS_ID = 'class-2A';

const AttendancePage: NextPage = () => {
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [isSent, setIsSent] = useState(false);
  const { stats, students, deletingId, deleteRecord } = useAttendanceData(CLASS_ID);

  useEffect(() => {
    const saved = localStorage.getItem('monitorQuestion');
    if (saved) {
      setQuestion(saved);
    }
  }, []);

  const handleSendToMonitor = () => {
    if (!question.trim()) {
      alert('お題・アンケート内容を入力してください。');
      return;
    }
    localStorage.setItem('monitorQuestion', question.trim());
    try {
      const bc = new BroadcastChannel('monitor_channel');
      bc.postMessage({ type: 'UPDATE_QUESTION', question: question.trim() });
      bc.close();
    } catch {}

    router.push('/monitor');

    setIsSent(true);
    setTimeout(() => setIsSent(false), 3000);
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>2Aクラス 概要</h1>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.iconBtn}><BellIcon /></button>
          <UserProfileButton />
        </div>
      </div>

      {/* Top section */}
      <div className={styles.topSection}>
        <AttendanceGauge stats={stats} />
        <QuestionPanel
          question={question}
          onQuestionChange={setQuestion}
          isSent={isSent}
          onSend={handleSendToMonitor}
        />
      </div>

      <RealtimeAttendanceTable
        students={students}
        deletingId={deletingId}
        onDelete={deleteRecord}
      />
    </div>
  );
};

export default AttendancePage;

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

const DEFAULT_CLASS_ID = 'class-2A';

const AttendancePage: NextPage = () => {
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedImageName, setAttachedImageName] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  const classId = (router.query.classId as string) || DEFAULT_CLASS_ID;
  const scheduleId = (router.query.scheduleId as string) || null;
  const { stats, students, deletingId, deleteRecord } = useAttendanceData(classId, scheduleId);

  useEffect(() => {
    const saved = localStorage.getItem('monitorQuestion');
    if (saved) {
      setQuestion(saved);
    }
    const savedImg = localStorage.getItem('monitorImage');
    if (savedImg) {
      setAttachedImage(savedImg);
    }
    const savedImgName = localStorage.getItem('monitorImageName');
    if (savedImgName) {
      setAttachedImageName(savedImgName);
    }
  }, []);

  const handleAttachImage = (dataUrl: string, name: string) => {
    setAttachedImage(dataUrl);
    setAttachedImageName(name);
  };

  const handleRemoveImage = () => {
    setAttachedImage(null);
    setAttachedImageName(null);
  };

  const handleSendToMonitor = () => {
    if (!question.trim() && !attachedImage) {
      alert('お題・アンケート内容を入力するか、画像を添付してください。');
      return;
    }

    try {
      localStorage.setItem('monitorQuestion', question.trim());
      if (attachedImage) {
        localStorage.setItem('monitorImage', attachedImage);
        if (attachedImageName) localStorage.setItem('monitorImageName', attachedImageName);
      } else {
        localStorage.removeItem('monitorImage');
        localStorage.removeItem('monitorImageName');
      }
    } catch (error) {
      console.error('Storage quota exceeded or other error:', error);
      alert('画像の保存に失敗しました。容量制限をオーバーしている可能性があります。');
      return;
    }

    try {
      const bc = new BroadcastChannel('monitor_channel');
      bc.postMessage({ type: 'UPDATE_QUESTION', question: question.trim(), image: attachedImage });
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
          attachedImage={attachedImage}
          attachedImageName={attachedImageName}
          onAttachImage={handleAttachImage}
          onRemoveImage={handleRemoveImage}
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

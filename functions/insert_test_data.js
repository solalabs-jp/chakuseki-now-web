const admin = require("firebase-admin");

// Initialize the Firebase Admin SDK
admin.initializeApp({
  projectId: "chakuseki-now"
});

const db = admin.firestore();

// 1. users
// role: "student" の場合は grade (string), className (string) を持つ
// role: "teacher" の場合は grade/className を持たない
const usersData = [
  { id: "student-001", name: "山田 太郎", role: "student", grade: "2", className: "A" },
  { id: "student-002", name: "鈴木 花子", role: "student", grade: "2", className: "A" },
  { id: "teacher-001", name: "Kota Nemoto", role: "teacher" },
  { id: "teacher-002", name: "Ayaka Sato", role: "teacher" }
];

// 2. classes
// id: 一意なクラスID
// grade: 学年 (string)
// name: クラス表示名 (string)
const classesData = [
  { id: "class-2A", grade: "2", name: "2025A" },
  { id: "class-2B", grade: "2", name: "2025B" }
];

// 3. periods
// id: 一意な時限ID
// number: 時限番号 (number)
// startTime / endTime: "HHMM" 形式の文字列 (string)
const periodsData = [
  { id: "period-1", number: 1, startTime: "0915", endTime: "1045" },
  { id: "period-2", number: 2, startTime: "1100", endTime: "1230" },
  { id: "period-3", number: 3, startTime: "1320", endTime: "1450" },
  { id: "period-4", number: 4, startTime: "1505", endTime: "1600" }
];

// 4. schedules
// id: 一意なスケジュールID
// classId: classes コレクションの doc ID (string)
// periodId: periods コレクションの doc ID (string)
// subjectName: 科目名 (string)
// teacherId: users コレクション (role: "teacher") の doc ID (string)
// dayOfWeek: 曜日 (number) ※ 1=月, 2=火, 3=水, 4=木, 5=金
// ⚠ 修正: teacher-003/004 は存在しないため teacher-001/002 を使用
// ⚠ 修正: dayOfWeek を number 型に統一
const schedulesData = [
  { id: "schedule-001", classId: "class-2A", periodId: "period-1", subjectName: "ITマネジメント",   teacherId: "teacher-001", dayOfWeek: 1 },
  { id: "schedule-002", classId: "class-2B", periodId: "period-2", subjectName: "Webアプリ開発",   teacherId: "teacher-002", dayOfWeek: 1 },
  { id: "schedule-003", classId: "class-2A", periodId: "period-3", subjectName: "データベース",     teacherId: "teacher-001", dayOfWeek: 2 },
  { id: "schedule-004", classId: "class-2B", periodId: "period-4", subjectName: "情報セキュリティ", teacherId: "teacher-002", dayOfWeek: 2 }
];

// 5. dailySessions
// id: 一意なセッションID
// scheduleId: schedules コレクションの doc ID (string)
// classId: classes コレクションの doc ID (string) ── scheduleId と対応させる
// date: 授業実施日 (Timestamp)
// ⚠ 修正: daily-session-002 の classId を schedule-002 に対応する "class-2B" へ修正
const dailySessionsData = [
  {
    id: "daily-session-001",
    scheduleId: "schedule-001",
    classId: "class-2A",
    date: admin.firestore.Timestamp.fromDate(new Date("2026-05-25"))
  },
  {
    id: "daily-session-002",
    scheduleId: "schedule-002",
    classId: "class-2B",  // ⚠ 修正: "class-2A" → "class-2B" (schedule-002 は class-2B)
    date: admin.firestore.Timestamp.fromDate(new Date("2026-05-26"))
  }
];

// 6. checkinQuestion
// id: 一意な質問ID
// dailySessionId: dailySessions コレクションの doc ID (string)
// isSkippable: スキップ可否 (boolean)
// questionText: 質問文 (string)
// sentAt: 送信日時 (Timestamp)
// teacherId: users コレクション (role: "teacher") の doc ID (string)
// ⚠ 修正: フィールド名 "dailySessionsId" → "dailySessionId" (単数形に統一)
const checkinQuestionData = [
  {
    id: "question-001",
    dailySessionId: "daily-session-001",  // ⚠ 修正: "dailySessionsId" → "dailySessionId"
    isSkippable: false,
    questionText: "今日のITマネジメントの授業で一番重要だと思ったことは何ですか？",
    sentAt: admin.firestore.Timestamp.fromDate(new Date("2026-06-10T12:07:11+09:00")),
    teacherId: "teacher-001"
  }
];

// 7. checkinAnswers
// id: 一意な回答ID
// checkinQuestionId: checkinQuestion コレクションの doc ID (string)
// studentId: users コレクション (role: "student") の doc ID (string)
// answerText: 回答文 (string)
// answeredAt: 回答日時 (Timestamp)
// ⚠ 修正: answeredAt を Timestamp 型に統一
const checkinAnswersData = [
  {
    id: "answer-001",
    checkinQuestionId: "question-001",
    studentId: "student-001",
    answerText: "プロジェクト管理の手法について",
    answeredAt: admin.firestore.Timestamp.fromDate(new Date("2026-06-10T12:15:00+09:00"))  // ⚠ 修正: Date → Timestamp
  }
];

// 8. attendanceRecords
// id: 一意なレコードID
// studentId: users コレクション (role: "student") の doc ID (string)
// dailySessionId: dailySessions コレクションの doc ID (string)
// scheduleId: schedules コレクションの doc ID (string)
// status: 出席状態 (string) ── "出席" | "遅刻" | "欠席" | "公欠"
// ⚠ 修正: フィールド名 "dailySessionsId" → "dailySessionId" (単数形に統一)
const attendanceRecordsData = [
  {
    id: "record-001",
    studentId: "student-001",
    dailySessionId: "daily-session-001",  // ⚠ 修正: "dailySessionsId" → "dailySessionId"
    scheduleId: "schedule-001",
    status: "出席"
  },
  {
    id: "record-002",
    studentId: "student-002",
    dailySessionId: "daily-session-001",  // ⚠ 修正: "dailySessionsId" → "dailySessionId"
    scheduleId: "schedule-001",
    status: "遅刻"
  }
];

// 9. attendanceOverrides
// id: 一意な修正レコードID
// attendanceRecordId: attendanceRecords コレクションの doc ID (string)
// originalStatus: 変更前の状態 (string)
// newStatus: 変更後の状態 (string)
// reason: 変更理由 (string)
// updatedBy: users コレクション (role: "teacher") の doc ID (string)
// ⚠ 修正: originalStatus を record-002 の実際の status ("遅刻") に合わせる
//         ただし override は「遅刻」を記録したときの元の欠席から修正した場合を想定するため、
//         record-002.status = "遅刻" はすでにオーバーライド後の状態とし、
//         originalStatus = "欠席" は「欠席として記録 → 遅刻に訂正」の流れとして整合させる
//         （record-002.status は最終確定後のステータスとして "遅刻" を維持）
const attendanceOverridesData = [
  {
    id: "override-001",
    attendanceRecordId: "record-002",
    originalStatus: "欠席",  // override前は「欠席」として記録されていた
    newStatus: "遅刻",        // 教師が「遅刻」に訂正
    reason: "電車遅延",
    updatedBy: "teacher-001"
  }
];

async function insertData() {
  try {
    const batch = db.batch();

    const insertToCollection = (collectionName, dataList) => {
      for (const item of dataList) {
        const docRef = db.collection(collectionName).doc(item.id);
        const { id, ...data } = item; // idはドキュメントIDとして使い、データからは除外
        batch.set(docRef, data);
      }
    };

    insertToCollection("users", usersData);
    insertToCollection("classes", classesData);
    insertToCollection("periods", periodsData);
    insertToCollection("schedules", schedulesData);
    insertToCollection("dailySessions", dailySessionsData);
    insertToCollection("checkinQuestion", checkinQuestionData);
    insertToCollection("checkinAnswers", checkinAnswersData);
    insertToCollection("attendanceRecords", attendanceRecordsData);
    insertToCollection("attendanceOverrides", attendanceOverridesData);

    console.log("テストデータを書き込んでいます...");
    await batch.commit();
    console.log("Cloud Firestoreへのテストデータのインサートが完了しました！");

  } catch (error) {
    console.error("エラーが発生しました:", error);
  }
}

insertData();

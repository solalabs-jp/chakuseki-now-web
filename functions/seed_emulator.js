// Firestore/Auth エミュレータ専用のテストデータ投入スクリプト。
// 本番プロジェクトへの誤投入を防ぐため、必ずここで emulator host を明示してから initializeApp する。
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

const admin = require("firebase-admin");

admin.initializeApp({ projectId: "chakuseki-now" });

const db = admin.firestore();
const PASSWORD = "password123";

// JSTの「今日 00:00」を Firestore Timestamp で返す。
// studentBeacon の「本日分の dailySessions を検索する」ロジックと噛み合わせるため、
// 固定の過去日付ではなく実行時点の日付を使う。
function todayJstMidnightTimestamp() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const d = jst.getUTCDate();
  const jstMidnightUtcMs = Date.UTC(y, m, d) - 9 * 60 * 60 * 1000;
  return admin.firestore.Timestamp.fromMillis(jstMidnightUtcMs);
}

// 1. users
// studentBeacon / studentTimetable / teacherScheduleTeacher が実際に読む classId・beaconId を
// 必ず含める。grade/className は既存の insert_test_data.js との互換のため残す。
const usersData = [
  { id: "student-001", name: "山田 太郎", role: "student", grade: "2", className: "A", classId: "class-2A", email: "student-001@example.com" },
  { id: "student-002", name: "鈴木 花子", role: "student", grade: "2", className: "A", classId: "class-2A", email: "student-002@example.com" },
  { id: "teacher-001", name: "Kota Nemoto", role: "teacher", beaconId: "BEACON-001", email: "teacher-001@example.com" },
  { id: "teacher-002", name: "Ayaka Sato", role: "teacher", beaconId: "BEACON-002", email: "teacher-002@example.com" },
];

// 2. classes
const classesData = [
  { id: "class-2A", grade: "2", name: "2025A" },
  { id: "class-2B", grade: "2", name: "2025B" },
];

// 3. periods
// フィールド名は startAt/endAt（実装コード getCurrentPeriodId が読む名前。insert_test_data.js の
// startTime/endTime は実装と一致しないため使わない）。型も実装が文字列比較するため文字列のまま。
const periodsData = [
  { id: "period-1", number: 1, startAt: "0915", endAt: "1045" },
  { id: "period-2", number: 2, startAt: "1100", endAt: "1230" },
  { id: "period-3", number: 3, startAt: "1320", endAt: "1450" },
  { id: "period-4", number: 4, startAt: "1505", endAt: "1600" },
];

// 4. schedules
// defaultTeacherId と teacherId の両方を設定する。
// teacherScheduleTeacher は defaultTeacherId(なければteacherId)を読み、
// generateDailySessions/adminGenerateDailySessions は teacherId のみを読むため。
const schedulesData = [
  { id: "schedule-001", classId: "class-2A", periodId: "period-1", subjectName: "ITマネジメント", teacherId: "teacher-001", defaultTeacherId: "teacher-001", dayOfWeek: 1 },
  { id: "schedule-002", classId: "class-2B", periodId: "period-2", subjectName: "Webアプリ開発", teacherId: "teacher-002", defaultTeacherId: "teacher-002", dayOfWeek: 1 },
  { id: "schedule-003", classId: "class-2A", periodId: "period-3", subjectName: "データベース", teacherId: "teacher-001", defaultTeacherId: "teacher-001", dayOfWeek: 2 },
  { id: "schedule-004", classId: "class-2B", periodId: "period-4", subjectName: "情報セキュリティ", teacherId: "teacher-002", defaultTeacherId: "teacher-002", dayOfWeek: 2 },
];

// studentBeacon の getCurrentPeriodId と同じロジックで「今、実行中の時限」を判定する。
// スクリプト実行時刻に一致する schedule を today のセッションに使うことで、
// 実行直後に studentBeacon を実際に呼び出して手動確認できるようにする
// （下校時間帯など、どの時限にも一致しない時間に実行した場合は null になる）。
function findActiveScheduleForNow() {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentHHmm =
    String(jstNow.getUTCHours()).padStart(2, "0") + String(jstNow.getUTCMinutes()).padStart(2, "0");
  const activePeriod = periodsData.find((p) => currentHHmm >= p.startAt && currentHHmm <= p.endAt);
  if (!activePeriod) return null;
  return schedulesData.find((s) => s.periodId === activePeriod.id) ?? null;
}

const activeSchedule = findActiveScheduleForNow();
const todaySchedule = activeSchedule ?? schedulesData[0];
const todayTeacher = usersData.find((u) => u.id === todaySchedule.teacherId);

// 5. timetables
// studentTimetable は schedules ではなく timetables を classId で参照するため別途投入する。
const timetablesData = [
  { id: "timetable-2A-1", classId: "class-2A", subjectName: "ITマネジメント", period: 1, dayOfWeek: 1 },
  { id: "timetable-2A-2", classId: "class-2A", subjectName: "データベース", period: 3, dayOfWeek: 2 },
  { id: "timetable-2B-1", classId: "class-2B", subjectName: "Webアプリ開発", period: 2, dayOfWeek: 1 },
  { id: "timetable-2B-2", classId: "class-2B", subjectName: "情報セキュリティ", period: 4, dayOfWeek: 2 },
];

// 6. dailySessions
// 過去日付の固定サンプルに加え、studentBeacon を今すぐ手動確認できるよう「今日」のセッションを追加する。
// scheduleId/teacherId はスクリプト実行時刻に一致する schedule(todaySchedule) に合わせる。
const dailySessionsData = [
  { id: "daily-session-001", scheduleId: "schedule-001", classId: "class-2A", teacherId: "teacher-001", date: admin.firestore.Timestamp.fromDate(new Date("2026-05-25T00:00:00+09:00")) },
  { id: "daily-session-002", scheduleId: "schedule-002", classId: "class-2B", teacherId: "teacher-002", date: admin.firestore.Timestamp.fromDate(new Date("2026-05-26T00:00:00+09:00")) },
  { id: "daily-session-today", scheduleId: todaySchedule.id, classId: todaySchedule.classId, teacherId: todaySchedule.teacherId, date: todayJstMidnightTimestamp() },
];

// 7. sessions
// studentBeacon が実際に書き込むフィールド名に合わせる:
// dailySessionId（daily_sessionsId ではない）、studentGeopoint は GeoPoint（gpsLat/gpsLng ではない）。
// beaconId は today の担当教師（todayTeacher）のものを使う。
const sessionsData = [
  {
    id: "session-today-001",
    studentId: "student-001",
    dailySessionId: "daily-session-today",
    beaconId: todayTeacher.beaconId,
    studentGeopoint: new admin.firestore.GeoPoint(35.6895, 139.6917),
    createdAt: admin.firestore.Timestamp.now(),
  },
  {
    id: "session-today-002",
    studentId: "student-002",
    dailySessionId: "daily-session-today",
    beaconId: todayTeacher.beaconId,
    studentGeopoint: new admin.firestore.GeoPoint(35.6895, 139.6917),
    createdAt: admin.firestore.Timestamp.now(),
  },
];

// 8. checkinQuestion
const checkinQuestionData = [
  {
    id: "question-001",
    dailySessionId: "daily-session-001",
    isSkippable: false,
    questionText: "今日のITマネジメントの授業で一番重要だと思ったことは何ですか？",
    sentAt: admin.firestore.Timestamp.fromDate(new Date("2026-06-10T12:07:11+09:00")),
    teacherId: "teacher-001",
  },
];

// 9. checkinAnswers
const checkinAnswersData = [
  {
    id: "answer-001",
    checkinQuestionId: "question-001",
    studentId: "student-001",
    answerText: "プロジェクト管理の手法について",
    answeredAt: admin.firestore.Timestamp.fromDate(new Date("2026-06-10T12:15:00+09:00")),
  },
];

// 10. attendanceRecords
// 既存の dailySessionId/scheduleId ベースのサンプルに加え、
// sessions コレクション経由（sessionId）のサンプルを1〜2件追加する。
const attendanceRecordsData = [
  { id: "record-001", studentId: "student-001", dailySessionId: "daily-session-001", scheduleId: "schedule-001", status: "出席" },
  { id: "record-002", studentId: "student-002", dailySessionId: "daily-session-001", scheduleId: "schedule-001", status: "遅刻" },
  { id: "record-today-001", studentId: "student-001", dailySessionId: "daily-session-today", scheduleId: todaySchedule.id, sessionId: "session-today-001", status: "出席" },
  { id: "record-today-002", studentId: "student-002", dailySessionId: "daily-session-today", scheduleId: todaySchedule.id, sessionId: "session-today-002", status: "出席" },
];

// 11. attendanceOverrides
const attendanceOverridesData = [
  { id: "override-001", attendanceRecordId: "record-002", originalStatus: "欠席", newStatus: "遅刻", reason: "電車遅延", updatedBy: "teacher-001" },
];

async function createAuthUsers() {
  for (const u of usersData) {
    try {
      await admin.auth().createUser({ uid: u.id, email: u.email, password: PASSWORD });
      console.log(`  [auth] created ${u.id} (${u.email})`);
    } catch (err) {
      if (err.code === "auth/uid-already-exists") {
        console.log(`  [auth] already exists, skipped: ${u.id}`);
      } else {
        throw err;
      }
    }
  }
}

async function writeFirestoreData() {
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
  insertToCollection("sessions", sessionsData);
  insertToCollection("checkinQuestion", checkinQuestionData);
  insertToCollection("checkinAnswers", checkinAnswersData);
  insertToCollection("attendanceRecords", attendanceRecordsData);
  insertToCollection("attendanceOverrides", attendanceOverridesData);
  insertToCollection("timetables", timetablesData);

  await batch.commit();
}

async function main() {
  console.log("Auth Emulator にユーザーを作成しています...");
  await createAuthUsers();

  console.log("Firestore Emulator にテストデータを書き込んでいます...");
  await writeFirestoreData();

  if (activeSchedule) {
    console.log(
      `現在時刻は ${todaySchedule.periodId} の時限内です。studentBeacon は beaconId="${todayTeacher.beaconId}" で今すぐテスト可能です（daily-session-today: ${todaySchedule.subjectName} / ${todayTeacher.name}）。`
    );
  } else {
    console.log(
      "現在時刻はどの period にも該当しないため、studentBeacon は今すぐにはテストできません（daily-session-today は schedule-001 を仮に使用しています）。"
    );
  }

  console.log("完了しました。");
}

main().catch((err) => {
  console.error("エラーが発生しました:", err);
  process.exit(1);
});

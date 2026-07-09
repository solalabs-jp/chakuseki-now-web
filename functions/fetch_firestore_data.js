/**
 * Firebase CLI のトークンを使って Firestore REST API 経由でデータをインサートするスクリプト
 * ADC 不要 - firebase-tools の認証情報を使用
 */

const { execSync } = require("child_process");
const https = require("https");

const PROJECT_ID = "chakuseki-now";

// Firebase CLI からアクセストークンを取得
function getToken() {
  try {
    // firebase-tools のキャッシュから直接トークンを読む
    const os = require("os");
    const path = require("path");
    const fs = require("fs");

    const configDir = path.join(os.homedir(), ".config", "configstore");
    const configFile = path.join(configDir, "firebase-tools.json");

    if (!fs.existsSync(configFile)) {
      throw new Error("firebase-tools config not found at: " + configFile);
    }

    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    const tokens = config.tokens;

    if (!tokens || !tokens.access_token) {
      throw new Error("No access token found in firebase-tools config");
    }

    return tokens.access_token;
  } catch (e) {
    throw new Error("Failed to get token: " + e.message);
  }
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// Firestore の値をシリアライズ
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === "string") return { stringValue: val };
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  // Firestore Timestamp-like object
  if (val && typeof val.toDate === "function") {
    return { timestampValue: val.toDate().toISOString() };
  }
  if (val && val._seconds !== undefined) {
    return { timestampValue: new Date(val._seconds * 1000).toISOString() };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreDocument(data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = toFirestoreValue(v);
  }
  return { fields };
}

async function upsertDocument(token, collectionName, docId, data) {
  const docPath = `projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}/${docId}`;
  const body = JSON.stringify(toFirestoreDocument(data));

  const options = {
    hostname: "firestore.googleapis.com",
    path: `/v1/${docPath}`,
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const res = await httpsRequest(options, body);
  if (res.statusCode >= 400) {
    throw new Error(`Failed to upsert ${collectionName}/${docId}: ${res.statusCode} ${res.body}`);
  }
  return res;
}

// ===== テストデータ定義 =====

const usersData = [
  { id: "student-001", name: "山田 太郎", role: "student", grade: "2", className: "A" },
  { id: "student-002", name: "鈴木 花子", role: "student", grade: "2", className: "A" },
  { id: "teacher-001", name: "Kota Nemoto", role: "teacher" },
  { id: "teacher-002", name: "Ayaka Sato", role: "teacher" },
];

const classesData = [
  { id: "class-2A", grade: "2", name: "2025A" },
  { id: "class-2B", grade: "2", name: "2025B" },
];

const periodsData = [
  { id: "period-1", number: 1, startTime: "0915", endTime: "1045" },
  { id: "period-2", number: 2, startTime: "1100", endTime: "1230" },
  { id: "period-3", number: 3, startTime: "1320", endTime: "1450" },
  { id: "period-4", number: 4, startTime: "1505", endTime: "1600" },
];

const schedulesData = [
  { id: "schedule-001", classId: "class-2A", periodId: "period-1", subjectName: "ITマネジメント",   teacherId: "teacher-001", dayOfWeek: 1 },
  { id: "schedule-002", classId: "class-2B", periodId: "period-2", subjectName: "Webアプリ開発",   teacherId: "teacher-002", dayOfWeek: 1 },
  { id: "schedule-003", classId: "class-2A", periodId: "period-3", subjectName: "データベース",     teacherId: "teacher-001", dayOfWeek: 2 },
  { id: "schedule-004", classId: "class-2B", periodId: "period-4", subjectName: "情報セキュリティ", teacherId: "teacher-002", dayOfWeek: 2 },
];

const dailySessionsData = [
  { id: "daily-session-001", scheduleId: "schedule-001", classId: "class-2A", date: new Date("2026-05-25T00:00:00+09:00") },
  { id: "daily-session-002", scheduleId: "schedule-002", classId: "class-2B", date: new Date("2026-05-26T00:00:00+09:00") },
];

const checkinQuestionData = [
  {
    id: "question-001",
    dailySessionId: "daily-session-001",
    isSkippable: false,
    questionText: "今日のITマネジメントの授業で一番重要だと思ったことは何ですか？",
    sentAt: new Date("2026-06-10T12:07:11+09:00"),
    teacherId: "teacher-001",
  },
];

const checkinAnswersData = [
  {
    id: "answer-001",
    checkinQuestionId: "question-001",
    studentId: "student-001",
    answerText: "プロジェクト管理の手法について",
    answeredAt: new Date("2026-06-10T12:15:00+09:00"),
  },
];

const attendanceRecordsData = [
  { id: "record-001", studentId: "student-001", dailySessionId: "daily-session-001", scheduleId: "schedule-001", status: "出席" },
  { id: "record-002", studentId: "student-002", dailySessionId: "daily-session-001", scheduleId: "schedule-001", status: "遅刻" },
];

const attendanceOverridesData = [
  { id: "override-001", attendanceRecordId: "record-002", originalStatus: "欠席", newStatus: "遅刻", reason: "電車遅延", updatedBy: "teacher-001" },
];

const collections = [
  { name: "users",              data: usersData },
  { name: "classes",            data: classesData },
  { name: "periods",            data: periodsData },
  { name: "schedules",          data: schedulesData },
  { name: "dailySessions",      data: dailySessionsData },
  { name: "checkinQuestion",    data: checkinQuestionData },
  { name: "checkinAnswers",     data: checkinAnswersData },
  { name: "attendanceRecords",  data: attendanceRecordsData },
  { name: "attendanceOverrides",data: attendanceOverridesData },
];

async function main() {
  console.log("🔑 Firebase CLI トークンを取得中...");
  const token = getToken();
  console.log("✅ トークン取得成功\n");

  console.log("📝 Firestore にテストデータを書き込んでいます...\n");

  for (const col of collections) {
    process.stdout.write(`  [${col.name}] `);
    for (const item of col.data) {
      const { id, ...data } = item;
      await upsertDocument(token, col.name, id, data);
      process.stdout.write(`${id} `);
    }
    console.log("✅");
  }

  console.log("\n🎉 Cloud Firestore へのテストデータのインサートが完了しました！");
}

main().catch((err) => {
  console.error("❌ エラーが発生しました:", err.message);
  process.exit(1);
});

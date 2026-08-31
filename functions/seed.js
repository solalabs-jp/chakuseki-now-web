const admin = require("firebase-admin");

process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
admin.initializeApp({ projectId: "chakuseki-now" });

async function seed() {
  const db = admin.firestore();
  
  // Create a user with a specific classId
  await db.collection("users").doc("test-student-001").set({
    role: "student",
    classId: "class-2A"
  });

  console.log("Seeded user 'test-student-001' with classId 'class-2A'");

  // Create timetables for class-2A
  const timetables = [
    { classId: "class-2A", subjectName: "ITマネジメント", period: 1, dayOfWeek: "月" },
    { classId: "class-2A", subjectName: "Webアプリ開発", period: 2, dayOfWeek: "月" },
    { classId: "class-2A", subjectName: "データベース", period: 1, dayOfWeek: "火" },
  ];

  for (const t of timetables) {
    await db.collection("timetables").add(t);
  }

  console.log("Seeded timetables for 'class-2A'");
}

seed().catch(console.error);

const http = require("http");
const admin = require("firebase-admin");

process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
admin.initializeApp({ projectId: "chakuseki-now" });

async function callIdentityToolkit(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: "localhost",
      port: 9099,
      path: "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function callApi(token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: 5001,
      path: "/chakuseki-now/us-central1/studentTimetable",
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function test() {
  const db = admin.firestore();
  
  // 1. Seed timetables
  const timetables = [
    { classId: "class-2A", subjectName: "ITマネジメント", period: 1, dayOfWeek: "月" },
    { classId: "class-2A", subjectName: "Webアプリ開発", period: 2, dayOfWeek: "月" },
    { classId: "class-2A", subjectName: "データベース", period: 1, dayOfWeek: "火" },
  ];

  for (const t of timetables) {
    await db.collection("timetables").add(t);
  }
  console.log("Seeded timetables for 'class-2A'");

  // 2. Create Auth User
  const email = `teststudent_${Date.now()}@example.com`;
  const password = "password123";
  console.log(`Signing up ${email}...`);
  const signUpRes = await callIdentityToolkit({ email, password, returnSecureToken: true });
  
  if (signUpRes.error) {
    console.error("Signup failed", signUpRes.error);
    return;
  }
  
  const idToken = signUpRes.idToken;
  const uid = signUpRes.localId;
  console.log(`User created. uid: ${uid}`);

  // 3. Set user doc in Firestore
  await db.collection("users").doc(uid).set({
    role: "student",
    classId: "class-2A"
  });
  console.log(`Seeded user doc for ${uid}`);

  // 4. Call API
  console.log("Calling studentTimetable API...");
  const apiRes = await callApi(idToken);
  console.log(`API Status: ${apiRes.status}`);
  console.log(`API Response: ${apiRes.data}`);
}

test().catch(console.error);

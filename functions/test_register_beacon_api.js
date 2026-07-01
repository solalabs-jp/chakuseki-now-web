const http = require("http");
const admin = require("firebase-admin");

// Set emulator environment variables
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
admin.initializeApp({ projectId: "chakuseki-now" });

const db = admin.firestore();

async function callApi(payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const options = {
      hostname: "localhost",
      port: 5001,
      path: "/chakuseki-now/us-central1/teacherRegisterBeacon",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(data || "{}") }));
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function test() {
  console.log("=== Starting Teacher Beacon Registration API Tests ===");

  // Ensure test data exists in emulator Firestore
  const teacherId1 = "teacher-001";
  const teacherId2 = "teacher-002";
  const studentId = "student-001";

  // Check/Insert test teacher-001
  const t1Doc = await db.collection("users").doc(teacherId1).get();
  if (!t1Doc.exists) {
    console.log(`Creating dummy ${teacherId1} doc...`);
    await db.collection("users").doc(teacherId1).set({
      name: "Kota Nemoto",
      role: "teacher"
    });
  }

  // Check/Insert test teacher-002
  const t2Doc = await db.collection("users").doc(teacherId2).get();
  if (!t2Doc.exists) {
    console.log(`Creating dummy ${teacherId2} doc...`);
    await db.collection("users").doc(teacherId2).set({
      name: "Ayaka Sato",
      role: "teacher"
    });
  }

  // Check/Insert test student-001
  const sDoc = await db.collection("users").doc(studentId).get();
  if (!sDoc.exists) {
    console.log(`Creating dummy ${studentId} doc...`);
    await db.collection("users").doc(studentId).set({
      name: "山田 太郎",
      role: "student",
      grade: "2",
      className: "A"
    });
  }

  // Test Case 1: Register using dummy session mapping to teacher-001
  console.log("\n[Test 1] Registering beacon for teacher-001 using dummy session...");
  const res1 = await callApi({
    session: "dummy-session-teacher-001",
    beaconId: "test-beacon-t1"
  });
  console.log(`Status: ${res1.status}`, res1.data);
  if (res1.status === 200) {
    const updatedDoc = await db.collection("users").doc(teacherId1).get();
    console.log("Updated Doc in DB:", updatedDoc.data());
  } else {
    throw new Error("Test 1 failed");
  }

  // Test Case 2: Register using direct doc ID mapping to teacher-002
  console.log("\n[Test 2] Registering beacon for teacher-002 using direct doc ID...");
  const res2 = await callApi({
    session: teacherId2,
    beaconId: "test-beacon-t2"
  });
  console.log(`Status: ${res2.status}`, res2.data);
  if (res2.status === 200) {
    const updatedDoc = await db.collection("users").doc(teacherId2).get();
    console.log("Updated Doc in DB:", updatedDoc.data());
  } else {
    throw new Error("Test 2 failed");
  }

  // Test Case 3: Validation Error (missing beaconId)
  console.log("\n[Test 3] Calling API with missing beaconId...");
  const res3 = await callApi({
    session: "dummy-session-teacher-001"
  });
  console.log(`Status: ${res3.status}`, res3.data);
  if (res3.status !== 400) {
    throw new Error("Test 3 failed - expected status 400");
  }

  // Test Case 4: Role constraint (trying to register a student session)
  console.log("\n[Test 4] Trying to register beacon for a student (forbidden)...");
  const res4 = await callApi({
    session: studentId,
    beaconId: "forbidden-beacon"
  });
  console.log(`Status: ${res4.status}`, res4.data);
  if (res4.status !== 403) {
    throw new Error("Test 4 failed - expected status 403");
  }

  console.log("\n=== All Tests Passed Successfully ===");
}

test().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

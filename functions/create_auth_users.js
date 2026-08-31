/**
 * Firebase Auth にテスト用ユーザーを登録するスクリプト
 * Firebase CLI のキャッシュトークンを使って Identity Toolkit REST API を呼び出す
 *
 * 実行: node functions/create_auth_users.js
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PROJECT_ID = "chakuseki-now";
const FIREBASE_API_KEY = "AIzaSyCVDH6YvxAz8xVKUzFLDT4r1wwu3HB3Ifw";

// テスト用ユーザー (Firestore の users コレクションと対応)
const TEST_USERS = [
  {
    firestoreId: "teacher-001",
    email: "teacher001@example.com",
    password: "password123",
    displayName: "Kota Nemoto",
    role: "teacher",
  },
  {
    firestoreId: "teacher-002",
    email: "teacher002@example.com",
    password: "password123",
    displayName: "Ayaka Sato",
    role: "teacher",
  },
  {
    firestoreId: "student-001",
    email: "student001@example.com",
    password: "password123",
    displayName: "山田 太郎",
    role: "student",
  },
  {
    firestoreId: "student-002",
    email: "student002@example.com",
    password: "password123",
    displayName: "鈴木 花子",
    role: "student",
  },
];

// Firebase CLI のトークンを取得
function getToken() {
  const configFile = path.join(
    os.homedir(),
    ".config",
    "configstore",
    "firebase-tools.json"
  );
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  const token = config.tokens?.access_token;
  if (!token) throw new Error("No access_token found in firebase-tools.json");
  return token;
}

// HTTPS リクエストヘルパー
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// Identity Admin API でユーザーを作成
async function createAuthUser(token, user) {
  const payload = JSON.stringify({
    email: user.email,
    password: user.password,
    displayName: user.displayName,
    emailVerified: true,
  });

  const { status, body } = await httpsRequest(
    {
      hostname: "identitytoolkit.googleapis.com",
      path: `/v1/projects/${PROJECT_ID}/accounts`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    payload
  );

  return { status, body };
}

// Firestore の users ドキュメントに email フィールドを追記
async function updateFirestoreEmail(token, firestoreId, email) {
  const docPath = `projects/${PROJECT_ID}/databases/(default)/documents/users/${firestoreId}`;
  // PATCH で email フィールドだけ更新 (updateMask を使用)
  const payload = JSON.stringify({
    fields: {
      email: { stringValue: email },
    },
  });

  const { status, body } = await httpsRequest(
    {
      hostname: "firestore.googleapis.com",
      path: `/v1/${docPath}?updateMask.fieldPaths=email`,
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    payload
  );

  return { status, body };
}

async function main() {
  console.log("🔑 Firebase CLI トークンを取得中...");
  const token = getToken();
  console.log("✅ トークン取得成功\n");

  for (const user of TEST_USERS) {
    process.stdout.write(`  [${user.firestoreId}] ${user.email} ... `);

    const { status, body } = await createAuthUser(token, user);

    if (status === 200) {
      console.log(`✅ 作成成功 (uid: ${body.localId})`);
    } else if (
      body?.error?.message === "EMAIL_EXISTS"
    ) {
      console.log(`⚠️  既に存在 (スキップ)`);
    } else {
      console.log(`❌ 失敗: ${body?.error?.message ?? status}`);
      continue;
    }

    // Firestore の users ドキュメントに email を追記
    const { status: fsStatus } = await updateFirestoreEmail(
      token,
      user.firestoreId,
      user.email
    );
    if (fsStatus < 300) {
      console.log(`    └─ Firestore に email を追記 ✅`);
    } else {
      console.log(`    └─ Firestore 更新失敗 (${fsStatus})`);
    }
  }

  console.log("\n🎉 テストユーザーのセットアップが完了しました！");
  console.log("\n📋 ログイン情報:");
  for (const u of TEST_USERS) {
    console.log(`  [${u.role}] ${u.email} / ${u.password}`);
  }
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});

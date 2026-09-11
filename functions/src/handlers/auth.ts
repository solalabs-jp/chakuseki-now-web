import {onRequest} from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import * as https from "https";
import * as http from "http";
import {db} from "../lib/firebase";
import {sendStatus, setCorsHeaders, isNonEmptyString} from "../lib/http";
import {requireTeacherCaller, requireTeacherTarget} from "../lib/auth";
import {
  normalizeBeaconId,
  releaseBeaconClaim,
  resolvePreviousNormalizedBeaconId,
  reassignBeaconClaim,
} from "../lib/beaconClaims";

type LoginRequestBody = {
  email?: unknown;
  password?: unknown;
};

type RegisterRequestBody = {
  email?: unknown;
  password?: unknown;
  role?: unknown;
  classId?: unknown;
  name?: unknown;
  beaconId?: unknown;
};

type DeleteUserRequestBody = {
  uid?: unknown;
};

type UpdateUserRequestBody = {
  uid?: unknown;
  email?: unknown;
  name?: unknown;
  classId?: unknown;
  beaconId?: unknown;
};

// Firebase Web API Key
// (FIREBASE_ prefix is reserved; use API_KEY instead)
const FIREBASE_API_KEY = process.env.API_KEY ?? "";

// ─── Auth: Login ────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 * Response: { idToken, uid, role, userId }
 *
 * Firebase Identity Toolkit REST API でサインインし、
 * Firestore の users コレクションからロール情報を付加して返す。
 */


export const loginWithEmailPassword = onRequest(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "POST email and password to login.",
      method: "POST",
      path: "/api/auth/login",
      body: {
        email: "teacher001@example.com",
        password: "password123",
      },
    });
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const body = (request.body ?? {}) as LoginRequestBody;

  if (!isNonEmptyString(body.email) || !isNonEmptyString(body.password)) {
    response.status(400).json({error: "email and password are required."});
    return;
  }

  if (!FIREBASE_API_KEY) {
    logger.error("FIREBASE_API_KEY is not set");
    response.status(500).json({error: "Server configuration error."});
    return;
  }

  try {
    // 1. Firebase Identity Toolkit で Email/Password サインイン
    const signInResult = await callIdentityToolkit({
      email: body.email,
      password: body.password,
      returnSecureToken: true,
    });

    // エラーレスポンスの確認
    const errorObj = signInResult.error as { message?: string } | undefined;
    if (errorObj) {
      const code = errorObj.message ?? "UNKNOWN";
      logger.warn("Login failed", {
        code,
        email: body.email,
      });

      if (
        code === "EMAIL_NOT_FOUND" ||
        code === "INVALID_PASSWORD" ||
        code === "INVALID_LOGIN_CREDENTIALS"
      ) {
        response.status(401).json({error: "Invalid email or password."});
      } else {
        response.status(400).json({error: code});
      }
      return;
    }

    const idToken = signInResult.idToken as string;
    const uid = signInResult.localId as string;

    // 2. Firestore の users コレクションから uid でロールを取得
    //    uid が Firestore の doc ID と一致しない場合は email で検索
    let role: string | null = null;
    let userId: string | null = null;
    let displayName: string | null = null;
    let grade: string | null = null;
    let className: string | null = null;
    let email: string | null = null;

    // まず uid で直接引く
    const directDoc = await db.collection("users").doc(uid).get();
    if (directDoc.exists) {
      role = directDoc.data()?.role ?? null;
      userId = uid;
      displayName =
        directDoc.data()?.name ?? directDoc.data()?.displayName ?? null;
      grade = directDoc.data()?.grade ?? null;
      className = directDoc.data()?.className ?? null;
      email = directDoc.data()?.email ?? null;
    } else {
      // uid が Firestore の doc ID と一致しない場合（テストデータ等）は email で検索
      const byEmailSnapshot = await db
        .collection("users")
        .where("email", "==", body.email)
        .limit(1)
        .get();
      if (!byEmailSnapshot.empty) {
        const matchedDoc = byEmailSnapshot.docs[0];
        role = matchedDoc.data()?.role ?? null;
        userId = matchedDoc.id;
        displayName =
          matchedDoc.data()?.name ?? matchedDoc.data()?.displayName ?? null;
        grade = matchedDoc.data()?.grade ?? null;
        className = matchedDoc.data()?.className ?? null;
        email = matchedDoc.data()?.email ?? null;
      }
    }

    if (role !== "teacher") {
      logger.warn("Login rejected: not a teacher account", {uid, role});
      response.status(403).json({error: "教員アカウントのみログインできます。"});
      return;
    }

    logger.info("Login successful", {uid, role, structuredData: true});

    response.status(200).json({
      idToken,
      uid,
      userId,
      role,
      displayName,
      grade,
      className,
      email,
      expiresIn: signInResult.expiresIn as string,
    });
  } catch (err: unknown) {
    const errObj = err as Record<string, unknown>;
    logger.error("authLogin error", {error: errObj});
    response.status(500).json({error: "Internal server error."});
  }
});

/**
 * Firebase Identity Toolkit REST API (signInWithPassword) を呼ぶヘルパー
 * エミュレータ環境では FIREBASE_AUTH_EMULATOR_HOST を参照して http で叩く
 * @param {object} payload - サインインリクエストのペイロード
 * @return {Promise<Record<string, unknown>>} Identity Toolkit のレスポンス
 */
function callIdentityToolkit(payload: {
  email: string;
  password: string;
  returnSecureToken: boolean;
}): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

    let requester: typeof https | typeof http;
    let options: http.RequestOptions;

    if (emulatorHost) {
      // エミュレータ: http でローカルホストを叩く
      const [hostname, portStr] = emulatorHost.split(":");
      requester = http;
      const requestPath =
        "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" +
        "fake-api-key";
      options = {
        hostname,
        port: portStr ? parseInt(portStr, 10) : 9099,
        path: requestPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      };
    } else {
      // 本番: https で Identity Toolkit を叩く
      requester = https;
      const requestPath =
        "/v1/accounts:signInWithPassword?key=" +
        FIREBASE_API_KEY;
      options = {
        hostname: "identitytoolkit.googleapis.com",
        path: requestPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      };
    }

    const req = requester.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Failed to parse Identity Toolkit response"));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * POST /api/auth/register
 * Body: { email: string, password: string, role: string, classId?: string }
 * Response: { uid, message }
 *
 * Firebase Admin SDK を用いてユーザーを作成し、
 * Firestore の users コレクションにロール情報を保存する。
 */
export const registerUser = onRequest(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "POST email, password, and role to register.",
      method: "POST",
      path: "/api/auth/register",
      body: {
        email: "newuser@example.com",
        password: "password123  ",
        role: "student",
        classId: "class-2A",
      },
    });
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const callerUid = await requireTeacherCaller(request, response);
  if (!callerUid) return;

  const body = (request.body ?? {}) as RegisterRequestBody;

  if (
    !isNonEmptyString(body.email) ||
    !isNonEmptyString(body.password) ||
    !isNonEmptyString(body.role)
  ) {
    response.status(400).json({
      error: "email, password, and role are required.",
    });
    return;
  }

  // role は許可された値のみ受け付ける。任意文字列を許すと teacher
  // アカウントから admin 相当のロールを持つユーザーを作成できてしまう。
  const ALLOWED_ROLES = ["teacher", "student"];
  if (!ALLOWED_ROLES.includes(body.role)) {
    response.status(400).json({
      error: `role must be one of: ${ALLOWED_ROLES.join(", ")}.`,
    });
    return;
  }

  try {
    // 1. Firebase Auth にユーザーを作成
    const userRecord = await admin.auth().createUser({
      email: body.email,
      password: body.password,
    });

    // 2. Firestore の users コレクションに権限などを保存
    const userData: Record<string, unknown> = {
      role: body.role,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (isNonEmptyString(body.classId)) {
      userData.classId = body.classId;
    }
    if (isNonEmptyString(body.name)) {
      userData.name = body.name;
    }
    const normalizedBeaconId = isNonEmptyString(body.beaconId) ?
      normalizeBeaconId(body.beaconId) :
      null;
    if (normalizedBeaconId) {
      userData.beaconId = body.beaconId;
      // studentBeacon が全教員を読んでメモリ上で正規化・比較する代わりに
      // 等価クエリで絞り込めるよう、正規化済みの値も保存しておく。
      userData.normalizedBeaconId = normalizedBeaconId;
    }
    userData.email = body.email;

    // beaconId を指定した教員登録の場合、beaconClaims で他の教員と重複
    // していないか原子的に確認する。registerUser は認証済み教員なら誰でも
    // 直接POSTできる公開HTTPSエンドポイントであり、Next.js側
    // (pages/api/teachers)の予約チェックだけでは迂回されてしまうため。
    // 新規ユーザーなので旧クレームは無く(previous=null)、student には
    // beaconClaims の一意性を課さない(claim対象IDは teacher のみ)。
    try {
      const reassigned = await reassignBeaconClaim(
        userRecord.uid,
        null,
        body.role === "teacher" ? normalizedBeaconId : null,
        () => db.collection("users").doc(userRecord.uid).set(userData),
        {adoptPlaceholder: true}
      );
      if (!reassigned) {
        await admin.auth().deleteUser(userRecord.uid).catch(() => undefined);
        response.status(409).json({
          error: "このビーコンIDは既に他の教員に登録されています。",
        });
        return;
      }
    } catch (dbErr) {
      // Firestore 書き込み失敗時は Auth アカウントを残さない(孤立防止)。
      // 孤立すると同じメールでの再作成が常に409になり、UIから復旧できない。
      // (確保済みの新クレームは reassignBeaconClaim 内で解放済み)
      await admin.auth().deleteUser(userRecord.uid).catch(() => undefined);
      throw dbErr;
    }

    logger.info("User registered successfully", {
      uid: userRecord.uid,
      role: body.role,
      structuredData: true,
    });

    response.status(201).json({
      uid: userRecord.uid,
      message: "User registered successfully.",
    });
  } catch (err: unknown) {
    const errObj = err as Record<string, unknown>;
    logger.error("Error registering user", {error: errObj});
    if (String(errObj?.code) === "auth/email-already-exists") {
      response.status(409).json({error: "Email already exists."});
    } else {
      response.status(500).json({error: "Internal server error."});
    }
  }
});

/**
 * POST /api/auth/delete-user
 * Body: { uid: string }
 * Response: { message: string }
 *
 * registerUserと対になる削除処理。Firebase Authアカウントと
 * Firestoreのusersドキュメントの両方を削除する。
 */
export const deleteUser = onRequest(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "POST uid to delete the user.",
      method: "POST",
      path: "/api/auth/delete-user",
      body: {uid: "abc123"},
    });
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const callerUid = await requireTeacherCaller(request, response);
  if (!callerUid) return;

  const body = (request.body ?? {}) as DeleteUserRequestBody;

  if (!isNonEmptyString(body.uid)) {
    response.status(400).json({error: "uid is required."});
    return;
  }

  try {
    const userSnap = await requireTeacherTarget(body.uid);
    if (!userSnap) {
      response.status(404).json({error: "Teacher not found."});
      return;
    }

    const userEmail = userSnap.data()?.email as string | undefined;

    // Authアカウントが既に存在しない場合はエラーにせず、Firestore側の
    // 削除だけ進める(整合性を取り戻す操作として許容する)。
    try {
      await admin.auth().deleteUser(body.uid);
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      if (String(errObj?.code) !== "auth/user-not-found") {
        throw err;
      }
      // Firestoreのdoc IDとAuth UIDが一致しない旧データでは、doc IDでの
      // 削除がuser-not-foundになる。emailから実UIDを解決して孤立Authアカウント
      // を残さないようにする。
      if (isNonEmptyString(userEmail)) {
        try {
          const authUser = await admin.auth().getUserByEmail(userEmail);
          await admin.auth().deleteUser(authUser.uid);
          logger.warn("deleteUser: removed orphan Auth account via email", {
            docId: body.uid,
            authUid: authUser.uid,
          });
        } catch (lookupErr: unknown) {
          const lookupErrObj = lookupErr as Record<string, unknown>;
          if (String(lookupErrObj?.code) !== "auth/user-not-found") {
            throw lookupErr;
          }
          logger.warn("deleteUser: no Auth account found for user", {
            docId: body.uid,
          });
        }
      } else {
        logger.warn("deleteUser: Auth user not found and no email to resolve", {
          docId: body.uid,
        });
      }
    }

    await db.collection("users").doc(body.uid).delete();

    // 削除した教員が beaconId を持っていた場合、beaconClaims の予約を
    // 解放する。deleteUser は認証済み教員なら誰でも直接POSTできる公開
    // HTTPSエンドポイントであり、Next.js側(pages/api/teachers)の解放
    // 処理を経由しない呼び出しだと予約が孤児として残ってしまうため、
    // ここでも解放する。
    const deletedNormalizedBeaconId = resolvePreviousNormalizedBeaconId(
      userSnap.data() ?? {}
    );
    if (deletedNormalizedBeaconId) {
      await releaseBeaconClaim(deletedNormalizedBeaconId);
    }

    logger.info("User deleted successfully", {
      uid: body.uid,
      structuredData: true,
    });

    response.status(200).json({message: "User deleted successfully."});
  } catch (err: unknown) {
    logger.error("Error deleting user", {error: err});
    response.status(500).json({error: "Internal server error."});
  }
});

/**
 * POST /api/auth/update-user
 * Body: { uid: string, email?: string, name?: string, classId?: string,
 *         beaconId?: string }
 * Response: { message: string }
 *
 * emailが渡された場合はFirebase Authのメールも更新し、Firestoreの
 * usersドキュメントとの乖離を防ぐ。他のフィールドはFirestoreのみ更新。
 */
export const updateUser = onRequest(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "POST uid and the fields to update.",
      method: "POST",
      path: "/api/auth/update-user",
      body: {uid: "abc123", email: "new@example.com", name: "山田 太郎"},
    });
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const callerUid = await requireTeacherCaller(request, response);
  if (!callerUid) return;

  const body = (request.body ?? {}) as UpdateUserRequestBody;

  if (!isNonEmptyString(body.uid)) {
    response.status(400).json({error: "uid is required."});
    return;
  }

  if (body.email !== undefined && !isNonEmptyString(body.email)) {
    response.status(400).json({error: "email cannot be empty."});
    return;
  }

  try {
    // 操作対象が teacher であることを確認する(deleteUser と同様の理由)。
    const targetSnap = await requireTeacherTarget(body.uid);
    if (!targetSnap) {
      response.status(404).json({error: "Teacher not found."});
      return;
    }

    if (isNonEmptyString(body.email)) {
      try {
        await admin.auth().updateUser(body.uid, {email: body.email});
      } catch (authErr: unknown) {
        if (
          String((authErr as Record<string, unknown>)?.code) !==
          "auth/user-not-found"
        ) {
          throw authErr;
        }
        // doc ID と Auth UID が不一致の旧データ。Firestore に保存済みの
        // 現メールアドレスから実 UID を解決し、Auth 側も必ず更新する。
        // 解決できなければ Auth と Firestore が乖離して教員がログイン
        // 不能になるため、更新せずエラーにする。
        const currentEmail = targetSnap.data()?.email as string | undefined;
        if (!isNonEmptyString(currentEmail)) {
          throw authErr;
        }
        const authUser = await admin.auth().getUserByEmail(currentEmail);
        await admin.auth().updateUser(authUser.uid, {email: body.email});
        logger.warn("updateUser: resolved Auth UID via email for legacy doc", {
          docId: body.uid,
          authUid: authUser.uid,
        });
      }
    }

    // この教員が以前登録していた beaconId(あれば)。beaconId が今回の
    // リクエストで指定されていなければ変更なし(previous と同値)として扱う。
    const targetData = targetSnap.data() ?? {};
    const previousNormalizedBeaconId =
      resolvePreviousNormalizedBeaconId(targetData);
    const newNormalizedBeaconId = body.beaconId === undefined ?
      previousNormalizedBeaconId :
      isNonEmptyString(body.beaconId) ?
        normalizeBeaconId(String(body.beaconId)) :
        null;

    const update: Record<string, unknown> = {};
    if (isNonEmptyString(body.email)) update.email = body.email;
    if (body.name !== undefined) update.name = body.name;
    if (body.classId !== undefined) update.classId = body.classId;
    if (body.beaconId !== undefined) {
      update.beaconId = body.beaconId;
      update.normalizedBeaconId = newNormalizedBeaconId ?? FieldValue.delete();
    }

    // updateUser は認証済み教員なら誰でも直接POSTできる公開HTTPS
    // エンドポイントであり、Next.js側(pages/api/teachers)の予約
    // チェックだけでは迂回されてしまうため、ここでも beaconClaims
    // による重複防止(1ビーコン=1教員)を保証する。
    const uid = body.uid;
    const reassigned = await reassignBeaconClaim(
      uid,
      previousNormalizedBeaconId,
      newNormalizedBeaconId,
      async () => {
        if (Object.keys(update).length > 0) {
          await db.collection("users").doc(uid).set(update, {merge: true});
        }
      }
    );
    if (!reassigned) {
      response.status(409).json({
        error: "このビーコンIDは既に他の教員に登録されています。",
      });
      return;
    }

    logger.info("User updated successfully", {
      uid: body.uid,
      structuredData: true,
    });

    response.status(200).json({message: "User updated successfully."});
  } catch (err: unknown) {
    const errObj = err as Record<string, unknown>;
    logger.error("Error updating user", {error: errObj});
    if (String(errObj?.code) === "auth/email-already-exists") {
      response.status(409).json({error: "Email already exists."});
    } else if (String(errObj?.code) === "auth/user-not-found") {
      response.status(404).json({error: "User not found."});
    } else {
      response.status(500).json({error: "Internal server error."});
    }
  }
});

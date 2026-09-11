import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {db} from "./firebase";
import type {FunctionRequest, FunctionResponse} from "./http";

export const verifyToken = async (
  request: FunctionRequest
): Promise<string | null> => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (err) {
    const errObj = err as Record<string, unknown>;
    logger.warn(
      "Token verification failed",
      {error: errObj}
    );
    return null;
  }
};

/*
 * registerUser/updateUser/deleteUserの保護用。これらはCloud FunctionsのURLに
 * 直接POSTすれば誰でも呼べてしまうため、ラッパーのNext.js API(requireTeacher)
 * とは別に、この関数自体でも呼び出し元がteacherロールでログイン済みかを検証する。
 */
export const requireTeacherCaller = async (
  request: FunctionRequest,
  response: FunctionResponse
): Promise<string | null> => {
  const callerUid = await verifyToken(request);
  if (!callerUid) {
    response.status(401).json({error: "Authentication required."});
    return null;
  }

  let callerDoc = await db.collection("users").doc(callerUid).get();
  if (!callerDoc.exists) {
    // uidがFirestoreのドキュメントIDと一致しない場合(シードデータ等)は
    // emailで検索する。Next.js側のrequireTeacherと同じフォールバック。
    try {
      const authUser = await admin.auth().getUser(callerUid);
      if (authUser.email) {
        const byEmail = await db
          .collection("users")
          .where("email", "==", authUser.email)
          .limit(1)
          .get();
        if (!byEmail.empty) {
          callerDoc = byEmail.docs[0];
        }
      }
    } catch (err) {
      logger.warn("requireTeacherCaller: email fallback failed", {error: err});
    }
  }

  if (!callerDoc.exists || callerDoc.data()?.role !== "teacher") {
    response.status(403).json({error: "Teacher role required."});
    return null;
  }

  return callerUid;
};

/*
 * deleteUser/updateUser の保護用。呼び出し元が teacher であることに加え、
 * 「操作対象」も teacher であることを確認する。これが無いと、teacher
 * トークンを持つ誰でも任意ユーザー(生徒・他教員・管理者)を削除・改変
 * できてしまう。
 */
export const requireTeacherTarget = async (
  uid: string
): Promise<FirebaseFirestore.DocumentSnapshot | null> => {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists || snap.data()?.role !== "teacher") return null;
  return snap;
};

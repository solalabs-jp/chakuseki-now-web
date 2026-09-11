import {setGlobalOptions} from "firebase-functions";
import * as admin from "firebase-admin";

// Firebase Admin SDKの初期化とグローバル設定はここで1回だけ行う。db を
// 参照する全てのモジュールがこのファイルを import することで、
// (import文は参照先モジュールの実行が先に完了することが保証されるため)
// どのハンドラファイルが最初にロードされても admin.initializeApp() が
// 必ず先に実行される。
admin.initializeApp();

setGlobalOptions({maxInstances: 10});

export const db = admin.firestore();

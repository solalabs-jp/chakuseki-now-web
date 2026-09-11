import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import type * as admin from "firebase-admin";
import {formatBeaconId} from "../beaconId";
import {db} from "./firebase";
import {isNonEmptyString} from "./http";

// normalizeBeaconId = formatBeaconId from lib/beaconId.ts (Next.js side).
// functions/src/beaconId.ts is a symlink to that file — both runtimes ship
// from a single implementation instead of two copies kept in sync by hand
// (a past mismatch between hand-synced copies caused a beaconId matching
// bug, fixed in 7a1ce93).
export const normalizeBeaconId = formatBeaconId;

/**
 * beaconClaims/{normalizedBeaconId} の予約を解放する(pages/api/teachers 側の
 * lib/beaconClaims.ts と同じ考え方)。既に無くても呼び出し元は失敗させない。
 * @param {string} normalizedBeaconId 解放する予約の doc ID(正規化済み beaconId)。
 * @return {Promise<void>} 完了を表す Promise。
 */
export async function releaseBeaconClaim(
  normalizedBeaconId: string
): Promise<void> {
  try {
    await db.collection("beaconClaims").doc(normalizedBeaconId).delete();
  } catch (error) {
    logger.error("releaseBeaconClaim failed", {normalizedBeaconId, error});
  }
}

/**
 * beaconClaims/{normalizedBeaconId} を teacherId 用に予約する(pages/api/teachers
 * 側の lib/beaconClaims.ts と同じ考え方)。.create() は既存なら失敗するため、
 * query してから write する非アトミックな実装が引き起こす TOCTOU レース
 * (ほぼ同時の2リクエストが両方「重複なし」と判定してしまう)を避けられる。
 *
 * registerUser/updateUser/teacherRegisterBeacon はいずれも、認証済み教員の
 * IDトークンさえあれば直接POSTできる公開HTTPSエンドポイントであり、
 * Next.js側(pages/api/teachers)の予約チェックはこの関数自体を保護しない
 * ため、ここでも同じ不変条件(1ビーコン=1教員)を保証する必要がある。
 * @param {string} normalizedBeaconId 予約する doc ID(正規化済み beaconId)。
 * @param {string} teacherId 予約者の uid。
 * @param {object} options オプション。
 * @param {boolean} [options.adoptPlaceholder] true の場合、owner="" の
 *   プレースホルダ予約(pages/api/teachers が uid 採番前に作るもの)を
 *   自分自身の予約とみなして実 uid で確定させる。registerUser からのみ
 *   true を渡す。
 * @return {Promise<boolean>} 予約できた(既に自分の予約だった場合を含む)か。
 */
export async function claimBeaconId(
  normalizedBeaconId: string,
  teacherId: string,
  options: { adoptPlaceholder?: boolean } = {}
): Promise<boolean> {
  const claimRef = db.collection("beaconClaims").doc(normalizedBeaconId);
  // このIDについて一度でもレガシー衝突チェック(下記)を通過済みなら、以後の
  // 呼び出し(同じ教員による再確認・再代入)では省略してよい。beaconClaims
  // 導入前の users ドキュメントは既存データであり増えることはないため、
  // 一度クリアなら以後もクリアなまま。
  let needsLegacyCheck = true;
  try {
    await claimRef.create({
      teacherId,
      createdAt: FieldValue.serverTimestamp(),
      legacyChecked: false,
    });
  } catch (createErr) {
    // create() は既存ドキュメントがある場合 ALREADY_EXISTS(code 6) で
    // 失敗する。それ以外(ネットワーク/権限エラー等の一時的な失敗)は
    // 「既存クレームあり」と誤判定せず、そのまま呼び出し元に投げて
    // 500 として扱う(ここで false を返すとビーコンが空いているのに
    // 409 を返してしまう)。
    if ((createErr as { code?: number })?.code !== 6) {
      throw createErr;
    }

    // 既に予約が存在する。所有者が自分自身なら重複ではない。
    const existingClaim = await claimRef.get();
    const existingData = existingClaim.data();
    const owner = existingClaim.exists ? existingData?.teacherId : undefined;
    if (owner !== teacherId) {
      // pages/api/teachers の新規登録は uid 採番前に teacherId="" の
      // プレースホルダで beaconClaims を予約してから registerUser を呼ぶ。
      // このときの owner="" は他の教員との競合ではなく自分自身の予約な
      // ので、adoptPlaceholder=true(registerUser からの呼び出し)の場合
      // に限り実際の teacherId で確定させる。他の呼び出し元
      // (updateUser/teacherRegisterBeacon)は既存の実 uid に対して更新
      // するだけで、この二段階予約パターンを使わないため対象外。
      if (options.adoptPlaceholder && owner === "") {
        await claimRef.set(
          {teacherId, createdAt: FieldValue.serverTimestamp()},
          {merge: true}
        );
      } else {
        return false;
      }
    } else {
      // 既に自分自身の確定済みクレームだった場合、過去にレガシーチェック
      // 済みならクエリを省略する(users への読み取りが倍増するのを防ぐ)。
      needsLegacyCheck = existingData?.legacyChecked !== true;
    }
  }

  if (needsLegacyCheck) {
    // beaconClaims 導入前に登録された beaconId とも衝突していないか確認する。
    const legacySnapshot = await db
      .collection("users")
      .where("role", "==", "teacher")
      .where("normalizedBeaconId", "==", normalizedBeaconId)
      .get();
    const legacyConflict = legacySnapshot.docs.some(
      (doc) => doc.id !== teacherId
    );
    if (legacyConflict) {
      await releaseBeaconClaim(normalizedBeaconId);
      return false;
    }

    await claimRef.set({legacyChecked: true}, {merge: true});
  }

  return true;
}

/**
 * users ドキュメントに保存されている(かもしれない)beaconId を正規化して
 * 返す。normalizedBeaconId フィールドがあればそれを優先し、無ければ
 * beaconId フィールドから改めて正規化する(beaconClaims 導入前のレガシー
 * データ対応)。updateUser/teacherRegisterBeacon の両方で「更新前の
 * beaconId」を求めるのに使う。
 * @param {admin.firestore.DocumentData} data users ドキュメントのデータ。
 * @return {string | null} 正規化済み beaconId。未登録なら null。
 */
export function resolvePreviousNormalizedBeaconId(
  data: admin.firestore.DocumentData
): string | null {
  if (isNonEmptyString(data.normalizedBeaconId)) {
    return String(data.normalizedBeaconId);
  }
  if (isNonEmptyString(data.beaconId)) {
    return normalizeBeaconId(String(data.beaconId));
  }
  return null;
}

/**
 * beaconId の再割り当てを「新IDを原子的に確保 → 書き込み → 旧IDを解放
 * (失敗時は確保した新IDを解放)」という1つの不変条件の下で行う共通処理。
 * registerUser/updateUser/teacherRegisterBeacon はいずれもこの手順を
 * 個別に実装していたため、プレースホルダー孤立化・表記ゆれ・原子的予約
 * 漏れといった同種の修正が一部の呼び出し箇所にしか反映されないリスクが
 * あった。ここに集約し、以後の修正は1箇所で済むようにする。
 * @param {string} teacherId クレームを保持する uid。
 * @param {string | null} previousNormalizedBeaconId 更新前の正規化済み
 *   beaconId(未登録なら null)。
 * @param {string | null} newNormalizedBeaconId 更新後の正規化済み
 *   beaconId(変更なし、またはクリアする場合は previousNormalizedBeaconId
 *   と同じ値 / null を渡す)。
 * @param {function(): Promise<unknown>} write 新IDの確保後に実行する Firestore
 *   書き込み。失敗した場合は確保した新IDを解放してから例外を再送出する。
 * @param {object} [options] claimBeaconId に渡すオプション。
 * @param {boolean} [options.adoptPlaceholder] claimBeaconId 参照。
 * @return {Promise<boolean>} 新IDが既に他の教員に登録されていて確保
 *   できなかった場合は false(write は呼ばれない)。それ以外は true。
 */
export async function reassignBeaconClaim(
  teacherId: string,
  previousNormalizedBeaconId: string | null,
  newNormalizedBeaconId: string | null,
  write: () => Promise<unknown>,
  options: { adoptPlaceholder?: boolean } = {}
): Promise<boolean> {
  if (newNormalizedBeaconId === previousNormalizedBeaconId) {
    await write();
    return true;
  }

  let claimedNewBeaconId = false;
  if (newNormalizedBeaconId) {
    const claimed = await claimBeaconId(
      newNormalizedBeaconId,
      teacherId,
      options
    );
    if (!claimed) {
      return false;
    }
    claimedNewBeaconId = true;
  }

  try {
    await write();
  } catch (writeErr) {
    if (claimedNewBeaconId && newNormalizedBeaconId) {
      await releaseBeaconClaim(newNormalizedBeaconId);
    }
    throw writeErr;
  }

  // 旧 beaconId の予約は書き込み成功後に解放する(失敗時に巻き戻せるよう順序を保つ)。
  if (
    previousNormalizedBeaconId &&
    previousNormalizedBeaconId !== newNormalizedBeaconId
  ) {
    await releaseBeaconClaim(previousNormalizedBeaconId);
  }

  return true;
}

import {
  createDocument,
  deleteDocument,
  getDocument,
  queryCollection,
  upsertDocument,
} from "./firestoreRest";

const COLLECTION = "beaconClaims";

/**
 * 「1つのビーコン = 1人の教員」を強制するための予約レコード。
 *
 * 正規化後の beaconId をそのまま doc ID にして createDocument で作成する。
 * createDocument は同じ doc ID が既に存在すると 409 (ALREADY_EXISTS) で失敗
 * するため、users コレクションを読んでから書き込むまでの間に別リクエストが
 * 割り込む TOCTOU レース(同時登録で両方が「重複なし」と判定してしまう)を
 * Firestore 側で確実に弾ける。schedules の重複防止(決定的 doc ID + createDocument)
 * と同じ考え方。
 *
 * 予約成功後に登録/更新自体が失敗したら、必ず releaseBeaconClaim で解放すること。
 */

/**
 * normalizedBeaconId を teacherId 用に予約する。
 *
 * - 予約できた場合、または既存の予約がこの教員自身のものだった場合は ok: true。
 * - 他の教員が既にそのビーコンを使っている場合は ok: false。
 *
 * teacherId が未採番(POST で uid 採番前)の場合は空文字を渡し、採番後に
 * assignBeaconClaim で確定させる。
 */
// POST は uid 採番前に teacherId="" のプレースホルダで予約し、採番後に
// assignBeaconClaim で確定させる。この間にプロセスが落ちる/タイムアウト
// すると teacherId="" のまま孤児になり得るため、これより古い空予約は
// 孤児とみなして上書きを許可する(そうしないと以後そのビーコンIDへの
// 予約が自己修復パスも無いまま永久にブロックされる)。
const STALE_PENDING_MS = 60_000;

export async function reserveBeaconId(
  normalizedBeaconId: string,
  teacherId: string
): Promise<{ ok: boolean }> {
  const created = await createDocument(COLLECTION, normalizedBeaconId, {
    teacherId,
    createdAt: new Date(),
  });

  if (!created.created) {
    // 既に予約が存在する。所有者がこの教員自身なら重複ではない
    // (同じ beaconId を保持したまま別フィールドだけ更新するケース)。
    const existing = await getDocument(COLLECTION, normalizedBeaconId);
    const owner = existing?.data.teacherId;
    if (owner && owner === teacherId) {
      return { ok: true };
    }

    if (!owner) {
      const createdAtValue = existing?.data.createdAt;
      const createdAtMs =
        typeof createdAtValue === "string" ? Date.parse(createdAtValue) : NaN;
      const isStale =
        !Number.isFinite(createdAtMs) || Date.now() - createdAtMs > STALE_PENDING_MS;

      if (!isStale) {
        // 採番中(登録処理が進行中)とみなし、重複扱いにする。
        return { ok: false };
      }

      // 孤児化した空予約を上書きして自分のものにする。
      await upsertDocument(COLLECTION, normalizedBeaconId, {
        teacherId,
        createdAt: new Date(),
      });
    } else {
      return { ok: false };
    }
  }

  // この予約レコードの仕組みを導入する前に登録された beaconId と衝突して
  // いないかも確認する。保存済みの beaconId は常に formatBeaconId で正規化
  // されているため、コレクション全体を読まずに等価クエリで判定できる。
  const existingUsers = await queryCollection("users", "beaconId", normalizedBeaconId);
  const conflict = existingUsers.some(
    (u) => u.data.role === "teacher" && u.id !== teacherId
  );
  if (conflict) {
    await releaseBeaconClaim(normalizedBeaconId);
    return { ok: false };
  }

  return { ok: true };
}

/** 予約レコードの teacherId を確定させる(POST で uid 採番後に呼ぶ)。 */
export async function assignBeaconClaim(
  normalizedBeaconId: string,
  teacherId: string
): Promise<void> {
  await upsertDocument(COLLECTION, normalizedBeaconId, { teacherId });
}

/** 予約を解放する。既に無い場合でも呼び出し元の処理は失敗させない。 */
export async function releaseBeaconClaim(normalizedBeaconId: string): Promise<void> {
  try {
    await deleteDocument(COLLECTION, normalizedBeaconId);
  } catch (error) {
    console.error("releaseBeaconClaim failed", normalizedBeaconId, error);
  }
}

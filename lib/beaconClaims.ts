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
    return { ok: Boolean(owner) && owner === teacherId };
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

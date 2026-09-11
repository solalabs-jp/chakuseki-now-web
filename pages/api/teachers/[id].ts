import type { NextApiRequest, NextApiResponse } from "next";
import { requireTeacher } from "../../../lib/auth";
import { formatBeaconId } from "../../../lib/beaconId";
import { deleteAuthUser, updateAuthUser } from "../../../lib/registerAuthUser";
import { getDocument } from "../../../lib/firestoreRest";
import { releaseBeaconClaim, reserveBeaconId } from "../../../lib/beaconClaims";

type TeacherInput = {
  name?: unknown;
  email?: unknown;
  classId?: unknown;
  beaconId?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const uid = await requireTeacher(req, res);
  if (!uid) return;
  const authHeader = req.headers.authorization as string;

  const id = String(req.query.id ?? "");

  if (!isNonEmptyString(id)) {
    res.status(400).json({ error: "id is required." });
    return;
  }

  if (req.method !== "DELETE" && req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH, DELETE");
    res.status(405).end();
    return;
  }

  // このエンドポイントは教員管理用。対象が教員でない(生徒・管理者など)場合は
  // 削除・改変を許可しない。
  const target = await getDocument("users", id);
  if (!target || target.data.role !== "teacher") {
    res.status(404).json({ error: "Teacher not found." });
    return;
  }

  if (req.method === "DELETE") {
    try {
      const result = await deleteAuthUser(id, authHeader);
      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(200).json({ id });
    } catch (error) {
      console.error("teachers DELETE error", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
    return;
  }

  const body = (req.body ?? {}) as TeacherInput;

  if (body.email !== undefined && !isNonEmptyString(body.email)) {
    res.status(400).json({ error: "email cannot be empty." });
    return;
  }

  const update: { uid: string; name?: string; email?: string; classId?: string; beaconId?: string } = {
    uid: id,
  };
  let hasUpdate = false;
  // beaconId を変更する場合、更新成功後に解放する旧予約と、更新失敗時に
  // 巻き戻す新予約を覚えておく。
  let beaconClaimToRelease: string | null = null;
  let beaconClaimToRollback: string | null = null;

  if (body.name !== undefined) {
    update.name = String(body.name);
    hasUpdate = true;
  }
  if (body.email !== undefined) {
    update.email = String(body.email);
    hasUpdate = true;
  }
  if (body.classId !== undefined) {
    update.classId = String(body.classId);
    hasUpdate = true;
  }
  if (body.beaconId !== undefined) {
    const normalizedBeaconId = isNonEmptyString(body.beaconId)
      ? formatBeaconId(body.beaconId)
      : "";
    const currentBeaconId = isNonEmptyString(target.data.beaconId)
      ? formatBeaconId(String(target.data.beaconId))
      : "";

    if (normalizedBeaconId !== currentBeaconId) {
      if (normalizedBeaconId) {
        // 他の教員が既に同じ beaconId を登録していないかを、正規化後の
        // beaconId を doc ID にした予約レコードの原子的な作成で確認する
        // (自分自身は除外)。listCollection の読み取り→書き込み分離による
        // TOCTOU レースを避けるため。理由は POST 側と同じ(誤帰属の防止)。
        const reserved = await reserveBeaconId(normalizedBeaconId, id);
        if (!reserved.ok) {
          res.status(409).json({ error: "このビーコンIDは既に他の教員に登録されています。" });
          return;
        }
        beaconClaimToRollback = normalizedBeaconId;
      }
      // 旧予約はユーザー更新が成功してから解放する(失敗時に巻き戻せるよう順序を保つ)。
      beaconClaimToRelease = currentBeaconId || null;
    }

    update.beaconId = normalizedBeaconId;
    hasUpdate = true;
  }

  if (!hasUpdate) {
    res.status(400).json({ error: "No fields to update." });
    return;
  }

  try {
    const result = await updateAuthUser(update, authHeader);
    if ("error" in result) {
      if (beaconClaimToRollback) await releaseBeaconClaim(beaconClaimToRollback);
      res.status(result.status).json({ error: result.error });
      return;
    }
    if (beaconClaimToRelease) await releaseBeaconClaim(beaconClaimToRelease);
    res.status(200).json({ id });
  } catch (error) {
    if (beaconClaimToRollback) await releaseBeaconClaim(beaconClaimToRollback);
    console.error("teachers PATCH error", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}

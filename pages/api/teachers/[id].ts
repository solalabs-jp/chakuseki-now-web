import type { NextApiRequest, NextApiResponse } from "next";
import { requireTeacher } from "../../../lib/auth";
import { formatBeaconId } from "../../../lib/beaconId";
import { deleteAuthUser, updateAuthUser } from "../../../lib/registerAuthUser";
import { getDocument, listCollection } from "../../../lib/firestoreRest";

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

    if (normalizedBeaconId) {
      // 他の教員が既に同じ(正規化後の)beaconIdを登録していないか確認する
      // (自分自身は除外)。理由は POST 側と同じ(誤帰属の防止)。
      const existingUsers = await listCollection("users");
      const duplicate = existingUsers.find(
        (u) =>
          u.id !== id &&
          u.data.role === "teacher" &&
          isNonEmptyString(u.data.beaconId) &&
          formatBeaconId(String(u.data.beaconId)) === normalizedBeaconId
      );
      if (duplicate) {
        res.status(409).json({ error: "このビーコンIDは既に他の教員に登録されています。" });
        return;
      }
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
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(200).json({ id });
  } catch (error) {
    console.error("teachers PATCH error", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}

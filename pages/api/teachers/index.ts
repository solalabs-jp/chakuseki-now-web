import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";
import { DEFAULT_PASSWORD, registerAuthUser } from "../../../lib/registerAuthUser";
import { formatBeaconId } from "../../../lib/beaconId";

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

  if (req.method === "GET") {
    try {
      const [users, classes] = await Promise.all([
        listCollection("users"),
        listCollection("classes"),
      ]);

      const classesById = new Map(classes.map((c) => [c.id, c.data]));

      const teachers = users
        .filter((u) => u.data.role === "teacher")
        .map((u) => ({
          id: u.id,
          name: u.data.name ?? "",
          email: u.data.email ?? "",
          classId: u.data.classId ?? "",
          className: classesById.get(String(u.data.classId ?? ""))?.name ?? "",
          beaconId: u.data.beaconId ?? "",
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));

      res.status(200).json({ teachers, classes: classes.map((c) => ({ id: c.id, name: c.data.name })) });
    } catch (error) {
      console.error("teachers GET error", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
    return;
  }

  if (req.method === "POST") {
    const body = (req.body ?? {}) as TeacherInput;

    if (!isNonEmptyString(body.name) || !isNonEmptyString(body.email)) {
      res.status(400).json({ error: "name and email are required." });
      return;
    }

    try {
      // 他の教員が既に同じ(正規化後の)beaconIdを登録していないか確認する。
      // 重複を許すと studentBeacon 側の検索がどちらか一方(Firestoreが
      // 返す順序に依存)にしかマッチせず、出席スキャンが誤帰属する。
      const normalizedBeaconId = isNonEmptyString(body.beaconId)
        ? formatBeaconId(body.beaconId)
        : undefined;
      if (normalizedBeaconId) {
        const existingUsers = await listCollection("users");
        const duplicate = existingUsers.find(
          (u) =>
            u.data.role === "teacher" &&
            isNonEmptyString(u.data.beaconId) &&
            formatBeaconId(String(u.data.beaconId)) === normalizedBeaconId
        );
        if (duplicate) {
          res.status(409).json({ error: "このビーコンIDは既に他の教員に登録されています。" });
          return;
        }
      }

      const result = await registerAuthUser(
        {
          email: body.email,
          password: DEFAULT_PASSWORD,
          role: "teacher",
          name: body.name,
          classId: isNonEmptyString(body.classId) ? body.classId : undefined,
          beaconId: normalizedBeaconId,
        },
        authHeader
      );
      if ("error" in result) {
        console.error("teachers POST: registerAuthUser failed", result.status, result.error);
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json({ id: result.uid });
    } catch (error) {
      console.error("teachers POST error", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).end();
}

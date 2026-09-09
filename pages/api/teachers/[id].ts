import type { NextApiRequest, NextApiResponse } from "next";
import { requireTeacher } from "../../../lib/auth";
import { formatBeaconId } from "../../../lib/beaconId";
import { deleteAuthUser, updateAuthUser } from "../../../lib/registerAuthUser";

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

  const id = String(req.query.id ?? "");

  if (!isNonEmptyString(id)) {
    res.status(400).json({ error: "id is required." });
    return;
  }

  if (req.method === "DELETE") {
    try {
      const result = await deleteAuthUser(id);
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

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH, DELETE");
    res.status(405).end();
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
    update.beaconId = isNonEmptyString(body.beaconId) ? formatBeaconId(body.beaconId) : "";
    hasUpdate = true;
  }

  if (!hasUpdate) {
    res.status(400).json({ error: "No fields to update." });
    return;
  }

  try {
    const result = await updateAuthUser(update);
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

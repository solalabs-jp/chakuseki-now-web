import type { NextApiRequest, NextApiResponse } from "next";
import { deleteDocument, upsertDocument } from "../../../lib/firestoreRest";

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
  const id = String(req.query.id ?? "");

  if (!isNonEmptyString(id)) {
    res.status(400).json({ error: "id is required." });
    return;
  }

  if (req.method === "DELETE") {
    try {
      await deleteDocument("users", id);
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
  const update: Record<string, unknown> = {};

  if (body.name !== undefined) update.name = body.name;
  if (body.email !== undefined) update.email = body.email;
  if (body.classId !== undefined) update.classId = body.classId;
  if (body.beaconId !== undefined) update.beaconId = body.beaconId;

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No fields to update." });
    return;
  }

  try {
    await upsertDocument("users", id, update);
    res.status(200).json({ id });
  } catch (error) {
    console.error("teachers PATCH error", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}

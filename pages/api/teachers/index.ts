import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection, upsertDocument } from "../../../lib/firestoreRest";

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
      const id = `teacher-${Date.now()}`;
      await upsertDocument("users", id, {
        role: "teacher",
        name: body.name,
        email: body.email,
        classId: isNonEmptyString(body.classId) ? body.classId : "",
        beaconId: isNonEmptyString(body.beaconId) ? body.beaconId : "",
        createAt: new Date().toISOString(),
      });
      res.status(201).json({ id });
    } catch (error) {
      console.error("teachers POST error", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).end();
}

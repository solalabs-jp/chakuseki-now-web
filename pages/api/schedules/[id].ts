import type { NextApiRequest, NextApiResponse } from "next";
import { deleteDocument } from "../../../lib/firestoreRest";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id ?? "");

  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    res.status(405).end();
    return;
  }

  if (!isNonEmptyString(id)) {
    res.status(400).json({ error: "id is required." });
    return;
  }

  try {
    await deleteDocument("schedules", id);
    res.status(200).json({ id });
  } catch (error) {
    console.error("schedules DELETE error", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}

import type { NextApiRequest, NextApiResponse } from "next";

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "chakuseki-now";
const useEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) || process.env.USE_FIREBASE_EMULATOR === "true";
const functionUrl = useEmulator
  ? `http://127.0.0.1:5001/${projectId}/us-central1/loginWithEmailPassword`
  : `https://us-central1-${projectId}.cloudfunctions.net/loginWithEmailPassword`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const response = await fetch(functionUrl, {
      method: req.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
      },
      body: req.method && ["POST", "PUT", "PATCH"].includes(req.method)
        ? JSON.stringify(req.body)
        : undefined,
    });

    const contentType = response.headers.get("content-type") ?? "application/json";
    const text = await response.text();

    res.status(response.status);
    if (contentType.includes("application/json")) {
      res.setHeader("content-type", "application/json");
      res.send(text ? JSON.parse(text) : {});
      return;
    }

    res.setHeader("content-type", contentType);
    res.send(text);
  } catch (error) {
    console.error("auth login proxy error", error);
    res.status(502).json({ error: "Failed to reach authentication service." });
  }
}

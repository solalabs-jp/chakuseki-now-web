import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { getDocument, listCollection } from "./firestoreRest";

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ??
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
  "chakuseki-now";

const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let cachedCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getGoogleCerts(): Promise<Record<string, string>> {
  if (cachedCerts && cachedCerts.expiresAt > Date.now()) {
    return cachedCerts.certs;
  }
  const response = await fetch(CERTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Firebase public certs: ${response.status}`);
  }
  const certs = (await response.json()) as Record<string, string>;
  cachedCerts = { certs, expiresAt: Date.now() + 60 * 60 * 1000 };
  return certs;
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export type VerifiedUser = { uid: string; email: string | null };

/**
 * Verifies a Firebase ID token's RS256 signature against Google's public
 * certs and checks standard claims (exp/iat/aud/iss), without depending on
 * firebase-admin. Returns null for any invalid/expired/malformed token.
 */
export async function verifyIdToken(idToken: string): Promise<VerifiedUser | null> {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    const header = JSON.parse(base64UrlDecode(headerB64).toString("utf8")) as {
      alg?: string;
      kid?: string;
    };
    if (header.alg !== "RS256" || !header.kid) return null;

    const certs = await getGoogleCerts();
    const cert = certs[header.kid];
    if (!cert) return null;

    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    const isValid = verifier.verify(crypto.createPublicKey(cert), base64UrlDecode(signatureB64));
    if (!isValid) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    const exp = Number(payload.exp ?? 0);
    const iat = Number(payload.iat ?? 0);

    if (!exp || exp < now) return null;
    if (!iat || iat > now + 60) return null;
    if (payload.aud !== PROJECT_ID) return null;
    if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;

    return { uid: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
  } catch {
    return null;
  }
}

/**
 * API route guard: requires a valid `Authorization: Bearer <idToken>` header
 * whose uid maps to a Firestore users/{uid} doc with role === "teacher".
 * Writes the 401/403 response itself and returns null when the check fails,
 * so callers can just `if (!uid) return;`.
 */
export async function requireTeacher(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string | null> {
  const authHeader = req.headers.authorization ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const verified = idToken ? await verifyIdToken(idToken) : null;
  if (!verified) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }

  // Seed/test users' Firestore doc IDs (e.g. "teacher-001") don't always match
  // the Firebase Auth UID Identity Toolkit issued for them, so fall back to
  // an email lookup when the direct uid lookup misses.
  let userDoc = await getDocument("users", verified.uid);
  if (!userDoc && verified.email) {
    const users = await listCollection("users");
    userDoc = users.find((u) => u.data.email === verified.email) ?? null;
  }

  if (!userDoc || userDoc.data.role !== "teacher") {
    res.status(403).json({ error: "Teacher role required." });
    return null;
  }

  return userDoc.id;
}

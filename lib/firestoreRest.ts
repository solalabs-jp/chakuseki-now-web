import fs from "fs";
import os from "os";
import path from "path";

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ??
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
  "chakuseki-now";

type FirestoreValue = Record<string, unknown>;

function getCliAccessToken(): string {
  const configFile = path.join(
    os.homedir(),
    ".config",
    "configstore",
    "firebase-tools.json"
  );
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  const token = config.tokens?.access_token;
  if (!token) {
    throw new Error("No access_token found in firebase-tools.json. Run `firebase login`.");
  }
  return token;
}

function fromFirestoreValue(value: FirestoreValue | undefined): unknown {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    const arrayValue = value.arrayValue as { values?: FirestoreValue[] };
    return (arrayValue.values ?? []).map(fromFirestoreValue);
  }
  if ("mapValue" in value) {
    const mapValue = value.mapValue as { fields?: Record<string, FirestoreValue> };
    return fromFirestoreFields(mapValue.fields ?? {});
  }
  return value;
}

function fromFirestoreFields(
  fields: Record<string, FirestoreValue>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = fromFirestoreValue(value);
  }
  return result;
}

export type FirestoreDoc = { id: string; data: Record<string, unknown> };

export async function listCollection(collectionName: string): Promise<FirestoreDoc[]> {
  const token = getCliAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to list ${collectionName}: ${response.status} ${await response.text()}`
    );
  }

  const parsed = (await response.json()) as {
    documents?: Array<{ name: string; fields?: Record<string, FirestoreValue> }>;
  };

  return (parsed.documents ?? []).map((doc) => ({
    id: doc.name.split("/").pop() as string,
    data: fromFirestoreFields(doc.fields ?? {}),
  }));
}

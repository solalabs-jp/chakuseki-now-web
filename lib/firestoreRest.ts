import fs from "fs";
import os from "os";
import path from "path";
import { UserRefreshClient } from "google-auth-library";

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ??
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
  "chakuseki-now";

type FirestoreValue = Record<string, unknown>;

// Public OAuth client shipped with firebase-tools (not a secret; identical for
// every install). Used to exchange the stored refresh_token for a fresh
// access_token so requests don't fail once the cached token expires.
const FIREBASE_CLI_CLIENT_ID =
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLI_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

type CliTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
};

type CliConfig = {
  user?: { email?: string };
  tokens?: CliTokens;
  activeAccounts?: Record<string, string>;
  additionalAccounts?: Array<{ user?: { email?: string }; tokens?: CliTokens }>;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function readCliConfig(): CliConfig {
  const configFile = path.join(
    os.homedir(),
    ".config",
    "configstore",
    "firebase-tools.json"
  );
  return JSON.parse(fs.readFileSync(configFile, "utf8")) as CliConfig;
}

/** Pick the tokens for the account active in this working directory. */
function selectAccountTokens(config: CliConfig): CliTokens {
  const activeEmail =
    config.activeAccounts?.[process.cwd()] ?? config.user?.email;

  if (activeEmail && config.user?.email === activeEmail && config.tokens) {
    return config.tokens;
  }

  const match = config.additionalAccounts?.find(
    (account) => account.user?.email === activeEmail
  );
  if (match?.tokens) {
    return match.tokens;
  }

  if (config.tokens) {
    return config.tokens;
  }

  throw new Error(
    "No Firebase CLI credentials found. Run `firebase login` (or `firebase login:use <email>`)."
  );
}

async function getCliAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.value;
  }

  const tokens = selectAccountTokens(readCliConfig());

  // Reuse the cached access_token while it is still comfortably valid.
  if (
    tokens.access_token &&
    typeof tokens.expires_at === "number" &&
    tokens.expires_at - Date.now() > 60_000
  ) {
    cachedToken = { value: tokens.access_token, expiresAt: tokens.expires_at };
    return tokens.access_token;
  }

  if (!tokens.refresh_token) {
    throw new Error(
      "Firebase CLI access_token is expired and no refresh_token is available. Run `firebase login --reauth`."
    );
  }

  const client = new UserRefreshClient(
    FIREBASE_CLI_CLIENT_ID,
    FIREBASE_CLI_CLIENT_SECRET,
    tokens.refresh_token
  );
  const { credentials } = await client.refreshAccessToken();
  const accessToken = credentials.access_token;
  if (!accessToken) {
    throw new Error("Failed to refresh Firebase CLI access token.");
  }

  cachedToken = {
    value: accessToken,
    expiresAt: credentials.expiry_date ?? Date.now() + 55 * 60_000,
  };
  return accessToken;
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
  const token = await getCliAccessToken();
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

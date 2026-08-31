import fs from "fs";
import os from "os";
import path from "path";
import { GoogleAuth, UserRefreshClient } from "google-auth-library";

const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

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
let googleAuth: GoogleAuth | null = null;

const CLI_CONFIG_FILE = path.join(
  os.homedir(),
  ".config",
  "configstore",
  "firebase-tools.json"
);

function readCliConfig(): CliConfig | null {
  if (!fs.existsSync(CLI_CONFIG_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(CLI_CONFIG_FILE, "utf8")) as CliConfig;
}

/** Pick the tokens for the account active in this working directory. */
function selectAccountTokens(config: CliConfig): CliTokens | null {
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

  return config.tokens ?? null;
}

/**
 * Local dev: use the token stored by `firebase login`, refreshing it when the
 * cached access_token has expired. Returns null when no CLI credentials exist
 * (e.g. on App Hosting / Cloud Run), so the caller can fall back to ADC.
 */
async function getCliAccessToken(): Promise<string | null> {
  const config = readCliConfig();
  if (!config) {
    return null;
  }

  const tokens = selectAccountTokens(config);
  if (!tokens) {
    return null;
  }

  // Reuse the cached access_token while it is still comfortably valid.
  if (
    tokens.access_token &&
    typeof tokens.expires_at === "number" &&
    tokens.expires_at - Date.now() > 60_000
  ) {
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

/**
 * Deployed environments (App Hosting / Cloud Run): use the runtime service
 * account via Application Default Credentials. Also works locally after
 * `gcloud auth application-default login`.
 */
async function getAdcAccessToken(): Promise<string> {
  if (!googleAuth) {
    googleAuth = new GoogleAuth({ scopes: [FIRESTORE_SCOPE] });
  }
  const client = await googleAuth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) {
    throw new Error(
      "Failed to obtain an access token from Application Default Credentials."
    );
  }
  const expiryDate = client.credentials.expiry_date ?? Date.now() + 55 * 60_000;
  cachedToken = { value: token, expiresAt: expiryDate };
  return token;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.value;
  }

  const cliToken = await getCliAccessToken();
  if (cliToken) {
    return cliToken;
  }

  return getAdcAccessToken();
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
  const token = await getAccessToken();
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

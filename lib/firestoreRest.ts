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

/**
 * Firestore REST 呼び出しの認証ソースを選ぶ。
 *  - "adc": 常に Application Default Credentials を使う(本番は App Hosting の
 *    ランタイム SA、ローカルは `gcloud auth application-default login`)。
 *    `firebase login` のトークンには一切触れないため
 *    `firebase login --reauth` が不要になる。
 *  - "cli": 常に `firebase login` のトークンを使う(従来の挙動)。
 *  - 未設定 / "auto": CLI トークンがあれば優先し、無ければ ADC にフォールバック。
 */
const FIRESTORE_AUTH = (process.env.FIRESTORE_AUTH ?? "auto").toLowerCase();

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.value;
  }

  if (FIRESTORE_AUTH === "adc") {
    return getAdcAccessToken();
  }

  let cliError: unknown;
  try {
    const cliToken = await getCliAccessToken();
    if (cliToken) {
      return cliToken;
    }
  } catch (err) {
    // "cli" 固定時はそのまま失敗させる。auto 時は ADC を試す。
    if (FIRESTORE_AUTH === "cli") throw err;
    cliError = err;
  }

  try {
    return await getAdcAccessToken();
  } catch (adcError) {
    // auto で CLI トークンが期限切れ等だった場合、そちらのエラーの方が
    // ローカル開発者にとって対処しやすい(`firebase login --reauth`)。
    throw cliError ?? adcError;
  }
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

export async function getDocument(
  collectionName: string,
  docId: string
): Promise<FirestoreDoc | null> {
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}/${docId}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Failed to get ${collectionName}/${docId}: ${response.status} ${await response.text()}`
    );
  }

  const doc = (await response.json()) as { name: string; fields?: Record<string, FirestoreValue> };
  return { id: docId, data: fromFirestoreFields(doc.fields ?? {}) };
}

export async function listCollection(collectionName: string): Promise<FirestoreDoc[]> {
  const token = await getAccessToken();
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}`;

  const docs: FirestoreDoc[] = [];
  let pageToken: string | undefined;

  // Firestore REST の :list は 1 レスポンスあたり最大 ~300 件しか返さない。
  // nextPageToken を辿って全ページを取得する(件数超過時の無言の切り詰め防止)。
  do {
    const url = new URL(baseUrl);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

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
      nextPageToken?: string;
    };

    for (const doc of parsed.documents ?? []) {
      docs.push({
        id: doc.name.split("/").pop() as string,
        data: fromFirestoreFields(doc.fields ?? {}),
      });
    }

    pageToken = parsed.nextPageToken;
  } while (pageToken);

  return docs;
}

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: toFirestoreFields(value as Record<string, unknown>) } };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

/**
 * 指定した docId でドキュメントを新規作成する。同じ docId のドキュメントが
 * 既に存在する場合は Firestore 側が 409 (ALREADY_EXISTS) を返し、失敗する。
 * upsertDocument(PATCH によるマージ)と異なりレース条件に強く、
 * 「同じキーを持つドキュメントが同時に2つ作られる」ことを防ぎたい場面
 * (例: 同一コマの重複登録防止)で使う。
 */
export async function createDocument(
  collectionName: string,
  docId: string,
  data: Record<string, unknown>
): Promise<{ created: true } | { created: false; alreadyExists: boolean }> {
  const token = await getAccessToken();
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}`
  );
  url.searchParams.set("documentId", docId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });

  if (response.status === 409) {
    return { created: false, alreadyExists: true };
  }
  if (!response.ok) {
    throw new Error(
      `Failed to create ${collectionName}/${docId}: ${response.status} ${await response.text()}`
    );
  }
  return { created: true };
}

/**
 * Merge-writes the given fields into a document, creating it if it doesn't
 * exist yet. Fields not included in `data` are left untouched.
 */
export async function upsertDocument(
  collectionName: string,
  docId: string,
  data: Record<string, unknown>
): Promise<void> {
  const token = await getAccessToken();
  const updateMask = Object.keys(data)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}/${docId}?${updateMask}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to upsert ${collectionName}/${docId}: ${response.status} ${await response.text()}`
    );
  }
}

/**
 * 単一フィールドの等価条件で絞り込んだドキュメントを取得する。
 * listCollection と違い、対象コレクション全体を読まずに済むため、
 * 特定 ID への参照有無だけを確認したいケースに向く。
 */
export async function queryCollection(
  collectionName: string,
  field: string,
  value: unknown
): Promise<FirestoreDoc[]> {
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collectionName }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: "EQUAL",
            value: toFirestoreValue(value),
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to query ${collectionName} where ${field}==${String(value)}: ${response.status} ${await response.text()}`
    );
  }

  const parsed = (await response.json()) as Array<{
    document?: { name: string; fields?: Record<string, FirestoreValue> };
  }>;

  return parsed
    .filter((entry): entry is { document: { name: string; fields?: Record<string, FirestoreValue> } } =>
      Boolean(entry.document)
    )
    .map((entry) => ({
      id: entry.document.name.split("/").pop() as string,
      data: fromFirestoreFields(entry.document.fields ?? {}),
    }));
}

export async function deleteDocument(collectionName: string, docId: string): Promise<void> {
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}/${docId}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to delete ${collectionName}/${docId}: ${response.status} ${await response.text()}`
    );
  }
}

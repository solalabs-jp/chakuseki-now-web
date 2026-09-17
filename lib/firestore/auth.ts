import fs from "fs";
import os from "os";
import path from "path";
import { GoogleAuth, UserRefreshClient } from "google-auth-library";

const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

// firebase-tools に同梱されているパブリック OAuth クライアント（秘密情報ではなく、
// すべてのインストール環境で同一）。キャッシュされたトークンの有効期限が切れてもリクエストが失敗しないよう、保存されている refresh_token を新しい
// access_token と交換するために使用されます。
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

/** この作業ディレクトリでアクティブなアカウントのトークンを選択します。 */
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
 * ローカル開発環境：`firebase login` で保存されたトークンを使用し、
 * キャッシュされた access_token の有効期限が切れた場合は更新します。CLI 認証情報が存在しない場合
 * （例：App Hosting や Cloud Run など）は null を返すため、呼び出し元は ADC にフォールバックできます。
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

// キャッシュされた access_token がまだ十分に有効な間は、それを再利用する。
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
 * デプロイ済みの環境（App Hosting / Cloud Run）：Application Default Credentials を通じて
 * ランタイムサービスアカウントを使用します。また、`gcloud auth application-default login` を実行した後は、
 * ローカル環境でも動作します。
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

export async function getAccessToken(): Promise<string> {
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

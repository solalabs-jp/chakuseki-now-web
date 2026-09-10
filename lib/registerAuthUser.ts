const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ??
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
  "chakuseki-now";

const useEmulator =
  Boolean(process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST) ||
  process.env.USE_FIREBASE_EMULATOR === "true";

const REGISTER_URL = useEmulator
  ? `http://127.0.0.1:5001/${PROJECT_ID}/us-central1/registerUser`
  : `https://us-central1-${PROJECT_ID}.cloudfunctions.net/registerUser`;

const DELETE_USER_URL = useEmulator
  ? `http://127.0.0.1:5001/${PROJECT_ID}/us-central1/deleteUser`
  : `https://us-central1-${PROJECT_ID}.cloudfunctions.net/deleteUser`;

const UPDATE_USER_URL = useEmulator
  ? `http://127.0.0.1:5001/${PROJECT_ID}/us-central1/updateUser`
  : `https://us-central1-${PROJECT_ID}.cloudfunctions.net/updateUser`;

type RegisterAuthUserInput = {
  email: string;
  password: string;
  role: string;
  classId?: string;
  name?: string;
  beaconId?: string;
};

type RegisterAuthUserResult =
  | { uid: string }
  | { error: string; status: number };

/**
 * Creates a real Firebase Auth account (via the registerUser Cloud Function)
 * with a Firestore users/{uid} doc keyed by the Auth UID. Used instead of
 * writing a bare Firestore doc so the account can actually log in / register
 * a BLE beacon.
 */
export async function registerAuthUser(
  input: RegisterAuthUserInput
): Promise<RegisterAuthUserResult> {
  const response = await fetch(REGISTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const rawText = await response.text();
  const data = (() => {
    try {
      return JSON.parse(rawText);
    } catch {
      return {};
    }
  })();

  if (!response.ok) {
    console.error("registerAuthUser: registerUser function failed", response.status, rawText);
    return {
      error: typeof data.error === "string" ? data.error : "Failed to register user.",
      status: response.status,
    };
  }

  return { uid: data.uid as string };
}

/**
 * Fixed initial password for accounts created from the admin UI. No
 * per-user password flow yet, so every new account gets the same value.
 */
export const DEFAULT_PASSWORD = "chakuseki2026";

type DeleteAuthUserResult = { ok: true } | { error: string; status: number };

/**
 * Deletes both the Firebase Auth account and the Firestore users/{uid} doc
 * (via the deleteUser Cloud Function), so removing a teacher doesn't leave
 * a stranded Auth account that can still log in / blocks re-registering the
 * same email.
 */
export async function deleteAuthUser(uid: string): Promise<DeleteAuthUserResult> {
  const response = await fetch(DELETE_USER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      error: typeof data.error === "string" ? data.error : "Failed to delete user.",
      status: response.status,
    };
  }

  return { ok: true };
}

type UpdateAuthUserInput = {
  uid: string;
  email?: string;
  name?: string;
  classId?: string;
  beaconId?: string;
};

type UpdateAuthUserResult = { ok: true } | { error: string; status: number };

/**
 * Updates a teacher's profile fields. When email is included, it's applied
 * to the Firebase Auth account too (via the updateUser Cloud Function) so
 * Firestore and the account used to actually log in never diverge.
 */
export async function updateAuthUser(input: UpdateAuthUserInput): Promise<UpdateAuthUserResult> {
  const response = await fetch(UPDATE_USER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      error: typeof data.error === "string" ? data.error : "Failed to update user.",
      status: response.status,
    };
  }

  return { ok: true };
}

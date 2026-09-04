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

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      error: typeof data.error === "string" ? data.error : "Failed to register user.",
      status: response.status,
    };
  }

  return { uid: data.uid as string };
}

/** Generates a random temporary password meeting Firebase Auth's min length. */
export function generateTempPassword(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    "!1"
  );
}

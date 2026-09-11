import { getAccessToken } from "./auth";
import { PROJECT_ID } from "./config";
import {
  fromFirestoreFields,
  toFirestoreFields,
  type FirestoreValue,
} from "./values";

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
 * 指定されたフィールドをドキュメントにマージして書き込みます。ドキュメントがまだ存在しない場合は、
 * 作成します。`data`に含まれていないフィールドは変更されません。
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

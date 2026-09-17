import { getAccessToken } from "./auth";
import { PROJECT_ID } from "./config";
import type { FirestoreDoc } from "./docs";
import { fromFirestoreFields, toFirestoreValue, type FirestoreValue } from "./values";

export type FieldFilterOp =
  | "EQUAL"
  | "LESS_THAN"
  | "LESS_THAN_OR_EQUAL"
  | "GREATER_THAN"
  | "GREATER_THAN_OR_EQUAL";

export type FieldFilterSpec = { field: string; op: FieldFilterOp; value: unknown };

/**
 * 複数の等価/範囲条件(AND)で絞り込んだドキュメントを取得する。
 * queryCollection(単一の等価条件)の一般化版。「confirmedAt がある日の
 * 範囲内」のような、等価クエリでは表現できない絞り込みに使う。
 * 同一フィールドへの範囲条件だけの組み合わせなら複合インデックスは不要。
 */
export async function queryCollectionWhere(
  collectionName: string,
  filters: FieldFilterSpec[]
): Promise<FirestoreDoc[]> {
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;

  const fieldFilters = filters.map((f) => ({
    fieldFilter: {
      field: { fieldPath: f.field },
      op: f.op,
      value: toFirestoreValue(f.value),
    },
  }));
  const where =
    fieldFilters.length === 1
      ? fieldFilters[0]
      : { compositeFilter: { op: "AND", filters: fieldFilters } };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collectionName }],
        where,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to query ${collectionName}: ${response.status} ${await response.text()}`
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
  return queryCollectionWhere(collectionName, [{ field, op: "EQUAL", value }]);
}

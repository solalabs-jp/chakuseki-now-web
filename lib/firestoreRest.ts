/**
 * Firestore REST API の薄いクライアント。以前は本ファイル1つに認証・
 * 値変換・CRUD・クエリを全部書いていたが、長くなりすぎたため
 * lib/firestore/ 配下に分割した。呼び出し側(pages/api/* など多数)は
 * 変更不要で済むよう、公開 API はこれまでどおりここから re-export する。
 *
 *  - lib/firestore/auth.ts   … アクセストークン取得(CLI token / ADC)
 *  - lib/firestore/values.ts … Firestore REST の値表現との相互変換
 *  - lib/firestore/docs.ts   … get/list/create/upsert/delete
 *  - lib/firestore/query.ts  … 等価/範囲クエリ
 */
export * from "./firestore/docs";
export * from "./firestore/query";

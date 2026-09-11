// エントリポイント。各Cloud Functionの実装はドメインごとに
// src/handlers/ 配下へ分割し、ここでは re-export するだけにする
// (Firebaseへのデプロイ対象名を変えないため、エクスポート名は維持)。
export * from "./handlers/auth";
export * from "./handlers/student";
export * from "./handlers/teacher";
export * from "./handlers/scheduled";

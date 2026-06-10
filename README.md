# chakuseki-now-web

`chakuseki-now-web` は、学生の出欠管理を Firebase 上で提供するための Web アプリ試作です。現時点では、Firebase Hosting から静的ページを配信しつつ、学生向け・教員向けの HTTP API を Cloud Functions for Firebase で提供しています。

## アプリ概要

このリポジトリから読み取れる主なユースケースは次のとおりです。

- 学生が一定間隔でビーコン情報を送信し、教室への到着や滞在を記録する
- 学生が授業中の設問に回答して出席確認を行う
- 学生が出席カレンダー、出席率サマリー、時間割を確認する
- 教員が出欠記録を修正する
- 教員が授業用の確認質問を発行する
- 教員が担当教員の差し替えや出席簿の確認を行う

出欠管理の中心は API 側にあり、フロントエンド画面はまだ Firebase Hosting の初期テンプレートが置かれている段階です。そのため、現状は「画面実装前のモック API サーバーを兼ねた Firebase プロジェクト」という位置づけです。

## 構成

- `public/`
  Firebase Hosting で配信される静的ファイル置き場です。現在の `index.html` は Firebase の初期セットアップ画面です。
- `functions/src/index.ts`
  Cloud Functions の本体です。学生用 API と教員用 API が TypeScript で実装されています。
- `firebase.json`
  Hosting から `/api/...` へのアクセスを Functions にリライトする設定と、Emulator の設定が入っています。
- `firestore.rules`, `firestore.indexes.json`
  Firestore 用の設定ファイルです。ただし現在の Functions 実装では Firestore は未使用で、レスポンスはダミーデータを返します。

## 提供されている API

### 学生向け

- `POST /api/student/beacon`
  ビーコン ID と位置情報を送信します。
- `POST /api/student/answer`
  設問回答を送信して出席確認に利用します。
- `GET /api/student/attendance-calendar`
  日付ごとの出席状況を返します。
- `GET /api/student/attendance-summary`
  科目別の出席サマリーを返します。
- `GET /api/student/timetable`
  時間割データを返します。

### 教員向け

- `PATCH /api/teacher/attendance-record`
  学生の出欠記録を修正します。
- `POST /api/teacher/question`
  出席確認用の質問を登録します。
- `PATCH /api/teacher/schedule-teacher`
  授業担当教員を差し替えます。
- `GET /api/teacher/attendance-book`
  指定日の出席簿データを返します。

## 現状の実装上の特徴

- 認証はまだ本実装ではなく、ダミーのセッション文字列で判定しています
  - 学生: `dummy-session-student-001`
  - 教員: `dummy-session-teacher-001`
- API の `GET` では使い方サンプルを返すエンドポイントがあり、フロント実装前でも仕様確認しやすくなっています
- CORS が許可されており、別オリジンのフロントエンドからも検証しやすい構成です
- 出席カレンダー、出席率、時間割、出席簿は固定のダミーデータを返します

## 技術スタック

- Firebase Hosting
- Cloud Functions for Firebase
- TypeScript
- Node.js 24 (`functions/package.json` の設定)

## 開発メモ

ローカルでは Firebase Emulator を使って検証する前提の構成です。主な設定は `firebase.json` に入っています。

- Hosting: `5005`
- Functions: `5001`
- Firestore: `8080`
- Auth: `9099`

Functions 側は `functions/` ディレクトリでビルドされます。

```bash
cd functions
npm install
npm run build
```

プロジェクト全体を Firebase Emulator で起動する場合は、リポジトリルートで Firebase CLI を使います。

```bash
npx firebase emulators:start
```

## 今後の実装ポイント

- Firebase Hosting の初期ページを、学生用/教員用の実画面に置き換える
- ダミーセッションを Firebase Authentication に置き換える
- ダミーデータを Firestore 永続化に置き換える
- 出席判定ロジックと授業スケジュール管理を本実装化する

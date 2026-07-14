# Firestore Database Schema

## Overview

本システムは Firestore を使用して出席管理を行う。

---

# users

ユーザー情報。

| Field | Type | Description |
|-------|------|-------------|
| userId | string | ドキュメントID |
| classId | string | 所属クラスID |
| role | string | student または teacher |
| attendanceNumber | number | 出席番号 |
| name | string | 氏名 |
| email | string | メールアドレス |
| fcmToken | string | FCM通知トークン（生徒のみ） |
| beaconId | string | 使用するBeacon ID（先生のみ） |
| createAt | timestamp | 作成日時 |
| updateAt | timestamp | 更新日時 |

---

# classes

クラス情報。

| Field | Type | Description |
|-------|------|-------------|
| classId | string | ドキュメントID |
| name | string | クラス名（例: 2024-A組） |
| entryYear | number | 入学年 |
| createdAt | timestamp | 作成日時 |
| updateAt | timestamp | 更新日時 |

---

# schedules

曜日ごとの時間割。

| Field | Type | Description |
|-------|------|-------------|
| scheduleId | string | ドキュメントID |
| classId | string | クラスID |
| defaultTeacherId | string | 担当教師ID |
| periodId | string | 時限ID |
| subjectName | string | 科目名 |
| dayOfWeek | number | 曜日（0=日〜6=土） |
| createdAt | timestamp | 作成日時 |
| updateAt | timestamp | 更新日時 |

---

# periods

時限マスタ。

| Field | Type | Description |
|-------|------|-------------|
| periodId | string | ドキュメントID |
| period | number | 何限目か |
| startAt | number | 開始時刻（hhmm形式の4桁） |
| endAt | number | 終了時刻（hhmm形式の4桁） |

---

# dailySessions

実際に行われる授業。

| Field | Type | Description |
|-------|------|-------------|
| dailySessionsId | string | ドキュメントID |
| scheduleId | string | 元となる時間割ID |
| teacherId | string | 担当教師ID |
| date | timestamp | 授業日（yyyy-mm-dd 00:00:00.00） |
| isIndoor | boolean | trueで屋内授業 |

---

# sessions

学生のBeacon/GPS検知セッション。

| Field | Type | Description |
|-------|------|-------------|
| sessionId | string | ドキュメントID |
| daily_sessionsId | string | 対象授業ID |
| studentId | string | 学生ID |
| beaconId | string | 検知したBeacon ID（屋内用） |
| gpsLat | number | 緯度（屋外用） |
| gpsLng | number | 経度（屋外用） |
| createAt | timestamp | セッション作成日時 |

---

# attendanceRecords

学生ごとの出席状態を管理する。

| Field | Type | Description |
|-------|------|-------------|
| recordId | string | ドキュメントID |
| sessionId | string | 対象の sessions ドキュメントID |
| userId | string | 学生ID |
| status | string | 出席状態 |
| detectionMethod | string | 出席判定方法（ble、gps、manual） |
| firstDetectedAt | timestamp | 初回検知時刻 |
| confirmedAt | timestamp | 送信確定時刻 |
| lastDetectedAt | timestamp | 最終検知時刻 |
| absenceMinutes | number | 離席累計時間（分） |
| isExcused | boolean | 公欠かどうか |
| excusedReason | string | 公欠理由 |
| excusedFrom | timestamp | 公欠期間開始 |
| excusedTo | timestamp | 公欠期間終了 |

---

# attendanceOverrides

出席記録を教師が手動で変更した履歴を保存する。

| Field | Type | Description |
|-------|------|-------------|
| overrideId | string | ドキュメントID |
| recordId | string | 対象の attendanceRecords ドキュメントID |
| teacherId | string | 変更した教師ID |
| previousStatus | string | 変更前の出席状態 |
| newStatus | string | 変更後の出席状態 |
| reason | string | 変更理由 |
| overriddenAt | timestamp | 変更日時 |

---

# checkinQuestion

授業開始時に送信されるチェックイン質問。

| Field | Type | Description |
|-------|------|-------------|
| questionId | string | ドキュメントID |
| sessionId | string | 対象授業ID |
| teacherId | string | 作成した教師ID |
| questionText | string | 質問内容 |
| isSkippable | boolean | スキップ可能か |
| sentAt | timestamp | 送信日時 |

---

# checkinAnswers

チェックイン質問への学生回答。

| Field | Type | Description |
|-------|------|-------------|
| answerId | string | ドキュメントID |
| questionId | string | 質問ID |
| attendance_reId | string | 対象の attendanceRecords ドキュメントID |
| userId | string | 学生ID |
| answerText | string | 回答内容 |
| isSkipped | boolean | スキップ済みかどうか |
| answeredAt | timestamp | 回答日時 |

---

# Relationship

```
classes
   │
   └── schedules
            │
            └── dailySessions
                     │
                     ├── sessions
                     │        └── attendanceRecords
                     │                 └── attendanceOverrides
                     │
                     └── checkinQuestion
                              └── checkinAnswers

users
 ├── dailySessions（担当教師）
 ├── sessions
 ├── checkinQuestion
 ├── checkinAnswers
 └── attendanceOverrides
```

---

# Status

attendanceRecords.status の想定値

- present
- absent
- late
- early_leave
- mid_absence
- excused

---

# detectionMethod

attendanceRecords.detectionMethod の想定値

- ble
- gps
- manual

---

# User Role

| Role | Description |
|------|-------------|
| student | 学生 |
| teacher | 教師 |

---

# dayOfWeek

| Value | Day |
|------:|-----|
| 0 | Sunday |
| 1 | Monday |
| 2 | Tuesday |
| 3 | Wednesday |
| 4 | Thursday |
| 5 | Friday |
| 6 | Saturday |

---

# Notes

- Firestoreでは各コレクションは独立して管理する。
- リレーションはドキュメントID（string）によって表現する。
- 日時はすべて Firestore Timestamp を使用する。
- 屋外の位置情報は gpsLat / gpsLng（number）で保存する。
- Beacon/GPS検知結果は sessions に保存し、出席判定結果は attendanceRecords に保存する。
- 教師による出席修正は attendanceOverrides に履歴として保存する。

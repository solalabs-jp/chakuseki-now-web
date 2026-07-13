# Firestore Database Schema

## Overview

本システムは Firestore を使用して出席管理を行う。

---

# attendanceOverrides

出席記録を教師が手動で変更した履歴を保存する。

| Field | Type | Description |
|-------|------|-------------|
| recordId | string | 対象の attendanceRecords ドキュメントID |
| teacherId | string | 変更した教師ID |
| previousStatus | string | 変更前の出席状態 |
| newStatus | string | 変更後の出席状態 |
| reason | string | 変更理由 |
| overriddenAt | timestamp | 変更日時 |

---

# attendanceRecords

学生ごとの出席状態を管理する。

| Field | Type | Description |
|-------|------|-------------|
| userId | string | 学生ID |
| sessionId | string | 授業セッションID |
| status | string | 出席状態 |
| absenceMinutes | number | 遅刻・欠席時間（分） |
| detectionMethod | string | 出席判定方法（BLE、QRなど） |
| isExcused | boolean | 公欠かどうか |

---

# checkinAnswers

チェックイン質問への学生回答。

| Field | Type | Description |
|-------|------|-------------|
| sessionId | string | 授業セッションID |
| questionId | string | 質問ID |
| userId | string | 学生ID |
| answerText | string | 回答内容 |
| answeredAt | timestamp | 回答日時 |

---

# checkinQuestion

授業開始時に送信されるチェックイン質問。

| Field | Type | Description |
|-------|------|-------------|
| dailySessionsId | string | 対象授業ID |
| teacherId | string | 作成した教師ID |
| questionText | string | 質問内容 |
| isSkippable | boolean | スキップ可能か |
| sentAt | timestamp | 送信日時 |

---

# classes

クラス情報。

| Field | Type | Description |
|-------|------|-------------|
| name | string | クラス名 |
| grade | string | 学年 |

---

# dailySessions

実際に行われる授業。

| Field | Type | Description |
|-------|------|-------------|
| scheduleId | string | 元となる時間割ID |
| teacherId | string | 担当教師ID |
| classDate | timestamp | 授業日 |
| isIndoor | boolean | 屋内授業かどうか |

---

# periods

時限マスタ。

| Field | Type | Description |
|-------|------|-------------|
| period | number | 時限番号 |
| startAt | string | 開始時刻（HHmm） |
| endAt | string | 終了時刻（HHmm） |

---

# schedules

曜日ごとの時間割。

| Field | Type | Description |
|-------|------|-------------|
| classId | string | クラスID |
| subjectName | string | 科目名 |
| dayOfWeek | number | 曜日（0〜6） |
| periodId | string | 時限ID |
| defaultTeacherId | string | 担当教師ID |
| createdAt | timestamp | 作成日時 |

---

# sessions

学生のBLE検知セッション。

| Field | Type | Description |
|-------|------|-------------|
| studentId | string | 学生ID |
| scheduleId | string | 時間割ID |
| beaconId | string | 検知したBeacon ID |
| studentGeopoint | geopoint | 学生位置情報 |
| createdAt | timestamp | セッション開始日時 |

---

# users

ユーザー情報。

| Field | Type | Description |
|-------|------|-------------|
| name | string | 氏名 |
| email | string | メールアドレス |
| role | string | student または teacher |
| classId | string | 所属クラスID |
| beaconId | string | 使用するBeacon ID |
| fcmToken | string | FCM通知トークン |

---

# Relationship

```
classes
   │
   └── schedules
            │
            └── dailySessions
                     │
                     ├── attendanceRecords
                     │          └── attendanceOverrides
                     │
                     ├── checkinQuestion
                     │          └── checkinAnswers
                     │
                     └── sessions

users
 ├── attendanceRecords
 ├── checkinAnswers
 └── sessions
```

---

# Status

attendanceRecords.status の想定値

- present
- late
- absent
- leave_early
- pending

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
- 位置情報は Firestore GeoPoint を使用する。
- Beacon検知結果は sessions に保存し、出席判定結果は attendanceRecords に保存する。
- 教師による出席修正は attendanceOverrides に履歴として保存する。
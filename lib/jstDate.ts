/**
 * JST(Asia/Tokyo, UTC+9, DST無し)における「今日」の境界を UTC の Date として
 * 返すヘルパー。pages/api/attendance/realtime.ts(当日分の範囲クエリ)と
 * pages/api/schedules/[id].ts(当日以降の dailySessions 判定)がどちらも
 * 「JSTの当日境界」を必要としており、実装がばらばらだとタイムゾーン/DST
 * 関連の修正で片方だけ直して他方を直し忘れるリスクがあるため、ここに
 * 一本化する。
 */

function dateStringJst(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/** JST の「今日」の 0:00:00 を UTC の Date として返す。 */
export function startOfTodayJst(now: Date = new Date()): Date {
  return new Date(`${dateStringJst(now)}T00:00:00+09:00`);
}

/** JST の「今日」の 0:00:00〜翌日 0:00:00 の範囲を UTC の Date で返す。 */
export function jstDayBoundsUtc(now: Date = new Date()): { start: Date; end: Date } {
  const start = startOfTodayJst(now);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** JST での「今日」を "YYYY-MM-DD" 形式で返す。 */
export function jstTodayDateString(now: Date = new Date()): string {
  return dateStringJst(now);
}

/**
 * ISO 形式の日時文字列(または Firestore Timestamp を REST 経由で取得した
 * 値)を JST の "YYYY-MM-DD" に変換する。「当日分かどうか」を日付文字列の
 * 比較で判定したい場合に使う(範囲クエリが使えない/使いにくい箇所向け。
 * 範囲クエリで絞り込める場合は jstDayBoundsUtc を使う方が Firestore の
 * 読み取り件数を抑えられるので優先する)。パース不能な値には null を返す。
 */
export function toJstDateString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dateStringJst(date);
}

/**
 * サーバーのタイムゾーンに関係なく、JST での「現在」を getHours/getDay など
 * のローカル取得系メソッドがそのまま JST の値を返す Date として得る
 * (ロケール文字列の往復で作った見かけ上の Date なので、実時刻や他の
 * タイムゾーン計算には使わないこと。曜日・時分だけを見たい用途専用)。
 */
export function jstNow(now: Date = new Date()): Date {
  const jstString = now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" });
  return new Date(jstString);
}

/**
 * ISO 形式の日時文字列を JST の時刻表示("HH:MM:SS" / "HH:MM")にフォーマット
 * する。Firestore の Timestamp を REST API 経由で取得すると UTC の ISO 文字列
 * (例: "...T03:15:00Z")になるため、時刻部分を正規表現でそのまま切り出すと
 * JST とは9時間ずれてしまう。パース不能な値には fallback を返す。
 */
export function formatJstTime(
  value: unknown,
  options: { seconds?: boolean; fallback?: string } = {}
): string {
  const { seconds = true, fallback = "--:--:--" } = options;
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" as const } : {}),
  });
}

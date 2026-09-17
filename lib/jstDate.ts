/**
 * JST(Asia/Tokyo, UTC+9, DST無し)における「今日」の境界を UTC の Date として
 * 返すヘルパー。pages/api/attendance/realtime.ts(当日分の範囲クエリ)と
 * pages/api/schedules/[id].ts(当日以降の dailySessions 判定)がどちらも
 * 「JSTの当日境界」を必要としており、実装がばらばらだとタイムゾーン/DST
 * 関連の修正で片方だけ直して他方を直し忘れるリスクがあるため、ここに
 * 一本化する。
 *
 * functions/src/jstDate.ts はこのファイルへのシンボリックリンクなので、
 * Cloud Functions側と共有する。
 */

/**
 * 指定した日時のJSTでの日付を "YYYY-MM-DD" 形式で返す。
 * @param {Date} date 変換対象の日時。
 * @return {string} JSTでの "YYYY-MM-DD"。
 */
function dateStringJst(date: Date): string {
  return date.toLocaleDateString("sv-SE", {timeZone: "Asia/Tokyo"});
}

/**
 * JST の「今日」の 0:00:00 を UTC の Date として返す。
 * @param {Date} [now] 基準日時(省略時は現在時刻)。
 * @return {Date} JSTの今日0:00:00を表すDate。
 */
export function startOfTodayJst(now: Date = new Date()): Date {
  return new Date(`${dateStringJst(now)}T00:00:00+09:00`);
}

/**
 * JST の「今日」の 0:00:00〜翌日 0:00:00 の範囲を UTC の Date で返す。
 * @param {Date} [now] 基準日時(省略時は現在時刻)。
 * @return {{start: Date, end: Date}} JSTの今日の開始・終了時刻。
 */
export function jstDayBoundsUtc(
  now: Date = new Date()
): { start: Date; end: Date } {
  const start = startOfTodayJst(now);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {start, end};
}

/**
 * JST での「今日」を "YYYY-MM-DD" 形式で返す。
 * @param {Date} [now] 基準日時(省略時は現在時刻)。
 * @return {string} JSTでの "YYYY-MM-DD"。
 */
export function jstTodayDateString(now: Date = new Date()): string {
  return dateStringJst(now);
}

/**
 * ISO 形式の日時文字列(または Firestore Timestamp を REST 経由で取得した
 * 値)を JST の "YYYY-MM-DD" に変換する。「当日分かどうか」を日付文字列の
 * 比較で判定したい場合に使う(範囲クエリが使えない/使いにくい箇所向け。
 * 範囲クエリで絞り込める場合は jstDayBoundsUtc を使う方が Firestore の
 * 読み取り件数を抑えられるので優先する)。パース不能な値には null を返す。
 * @param {unknown} value ISO形式の日時文字列(それ以外はnull扱い)。
 * @return {string | null} JSTでの "YYYY-MM-DD"、パース不能ならnull。
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
 * @param {Date} [now] 基準日時(省略時は現在時刻)。
 * @return {Date} ローカル取得系メソッドがJSTの値を返す見かけ上のDate。
 */
export function jstNow(now: Date = new Date()): Date {
  const jstString = now.toLocaleString("en-US", {timeZone: "Asia/Tokyo"});
  return new Date(jstString);
}

/**
 * ISO 形式の日時文字列を JST の時刻表示("HH:MM:SS" / "HH:MM")にフォーマット
 * する。Firestore の Timestamp を REST API 経由で取得すると UTC の ISO 文字列
 * (例: "...T03:15:00Z")になるため、時刻部分を正規表現でそのまま切り出すと
 * JST とは9時間ずれてしまう。パース不能な値には fallback を返す。
 * @param {unknown} value ISO形式の日時文字列(それ以外はfallback扱い)。
 * @param {object} [options] オプション。
 * @param {boolean} [options.seconds] 秒まで含めるか(デフォルトtrue)。
 * @param {string} [options.fallback] パース不能時に返す文字列。
 * @return {string} JSTでの時刻表示、パース不能ならfallback。
 */
export function formatJstTime(
  value: unknown,
  options: { seconds?: boolean; fallback?: string } = {}
): string {
  const {seconds = true, fallback = "--:--:--"} = options;
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? {second: "2-digit" as const} : {}),
  });
}

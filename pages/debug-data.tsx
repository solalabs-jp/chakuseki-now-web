import { useEffect, useState } from "react";
import type { NextPage } from "next";

type AttendanceRow = {
  recordId: string;
  date: string | null;
  subjectName: string | null;
  className: string | null;
  studentName: string | null;
  status: string | null;
  absenceMinutes: number;
};

const DebugDataPage: NextPage = () => {
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/debug/data")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setRows(data.attendance);
      })
      .catch((err) => setError(String(err)));
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>本番Firestoreデータ（開発確認用）</h1>
      {error && <p style={{ color: "red" }}>エラー: {error}</p>}
      {!rows && !error && <p>読み込み中...</p>}
      {rows && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {["日付", "クラス", "科目", "生徒", "状態", "遅刻分"].map((h) => (
                <th
                  key={h}
                  style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", background: "#f5f5f5" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.recordId}>
                <td style={{ border: "1px solid #ddd", padding: 8 }}>{row.date}</td>
                <td style={{ border: "1px solid #ddd", padding: 8 }}>{row.className}</td>
                <td style={{ border: "1px solid #ddd", padding: 8 }}>{row.subjectName}</td>
                <td style={{ border: "1px solid #ddd", padding: 8 }}>{row.studentName}</td>
                <td style={{ border: "1px solid #ddd", padding: 8 }}>{row.status}</td>
                <td style={{ border: "1px solid #ddd", padding: 8 }}>{row.absenceMinutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default DebugDataPage;

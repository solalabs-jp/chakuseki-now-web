export type Status = '出席' | '欠席' | '遅刻' | '公欠' | '早退' | '中抜け';

export type AttendanceStats = {
  attendanceRate: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

export type RealtimeStudent = {
  recordId: string;
  id: string;
  name: string;
  status: Status;
  time: string;
  comment: string | null;
};

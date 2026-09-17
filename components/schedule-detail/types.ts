export const DAYS = ['月', '火', '水', '木', '金'];

export type ClassCell = {
  scheduleId: string;
  period: string;
  subject: string;
  teacher: string;
  room: string;
} | null;

export type ApiSchedule = {
  scheduleId: string;
  subject: string;
  teacher: string;
  dayOfWeek: number;
  period: number;
  periodLabel: string;
};

export type ApiPeriod = {
  id: string;
  period: number;
  label: string;
};

export type Teacher = {
  id: string;
  name: string;
};

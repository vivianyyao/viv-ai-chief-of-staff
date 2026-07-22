export type StructuredTask = {
  title: string;
  durationMinutes: number;
  earliestStart: string | null;
  deadline: string | null;
  notes: string | null;
};

export type BusyPeriod = { start: string; end: string };
export type TimeBlock = { start: string; end: string };

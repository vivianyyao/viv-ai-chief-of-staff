export type StructuredTask = {
  title: string;
  durationMinutes: number;
  earliestStart: string | null;
  deadline: string | null;
  notes: string | null;
};

export type InterpretedTask = {
  title: string;
  durationMinutes: number | null;
  deadline: string | null;
  priority: "low" | "medium" | "high";
  intent: "schedule_task";
};

export type BusyPeriod = { start: string; end: string };
export type TimeBlock = { start: string; end: string };

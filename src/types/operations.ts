export type OperationalTip = {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  why: string;
  action: string;
  askPrompt: string;
  evidence?: string;
};

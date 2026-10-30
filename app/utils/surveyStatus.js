// Shared (client + server) helpers for survey visibility.

/** "active" | "inactive" | "scheduled" | "expired" */
export function getSurveyStatus(survey, now = new Date()) {
  if (survey.isActive === false) return "inactive";
  const at = now instanceof Date ? now : new Date(now);
  if (survey.startsAt && at < new Date(survey.startsAt)) return "scheduled";
  if (survey.endsAt && at > new Date(survey.endsAt)) return "expired";
  return "active";
}

export const STATUS_BADGE = {
  active:    { tone: "success",   label: "Active" },
  inactive:  { tone: "critical",  label: "Off" },
  scheduled: { tone: "info",      label: "Scheduled" },
  expired:   { tone: "attention", label: "Expired" },
};

export const TARGET_TYPES = [
  { value: "all",        label: "Every order" },
  { value: "product",    label: "Orders containing specific products" },
  { value: "collection", label: "Orders containing products from specific collections" },
  { value: "country",    label: "Orders from specific countries" },
  { value: "min_total",  label: "Orders above a minimum amount" },
];

/** Short human description of a survey's targeting rule */
export function describeTarget(survey) {
  let value = null;
  try { value = survey.targetValue ? JSON.parse(survey.targetValue) : null; } catch (_) { value = null; }
  switch (survey.targetType) {
    case "product":    return `${value?.length ?? 0} product(s)`;
    case "collection": return `${value?.length ?? 0} collection(s)`;
    case "country":    return (value ?? []).join(", ") || "No countries";
    case "min_total":  return `Total ≥ ${value?.amount ?? 0}`;
    default:           return "Every order";
  }
}

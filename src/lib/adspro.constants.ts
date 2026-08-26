export const LEAD_STATUSES = [
  "contacted",
  "qualified",
  "not_qualified",
  "booked",
  "no_show",
  "purchased",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_TO_META_EVENT: Record<LeadStatus, string> = {
  contacted: "Lead_Contacted",
  qualified: "Lead_Qualified",
  not_qualified: "Lead_Disqualified",
  booked: "Schedule",
  no_show: "Lead_NoShow",
  purchased: "Purchase",
};

export function isLeadStatus(status: string): status is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(status);
}
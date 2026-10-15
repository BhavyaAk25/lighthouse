// Demo personas (fictional people) for the role-based prototype.

export type Role = "DECISION_OWNER" | "FINANCE_REVIEWER" | "SALES_REVIEWER" | "OPERATIONS_REVIEWER" | "LEGAL_REVIEWER" | "ADMIN";

export interface Persona {
  id: string;
  name: string;
  title: string;
  role: Role;
  initials: string;
  color: string;
  blurb: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  DECISION_OWNER: "Decision Owner",
  FINANCE_REVIEWER: "Finance Reviewer",
  SALES_REVIEWER: "Commercial Reviewer",
  OPERATIONS_REVIEWER: "Operations Reviewer",
  LEGAL_REVIEWER: "Legal & Compliance",
  ADMIN: "System Administrator",
};

export const PERSONAS: Persona[] = [
  {
    id: "maya",
    name: "Maya Chen",
    title: "VP, Regional Merchandising",
    role: "DECISION_OWNER",
    initials: "MC",
    color: "#142B45",
    blurb: "Opens decision cases, runs the agents and makes the final approve / reject / revise call.",
  },
  {
    id: "priya",
    name: "Priya Raman",
    title: "Senior Counsel, Compliance",
    role: "LEGAL_REVIEWER",
    initials: "PR",
    color: "#7A5C2A",
    blurb: "Reviews cases the Legal agent gates and records the human legal disposition.",
  },
  {
    id: "david",
    name: "David Okafor",
    title: "Director, Merchandise Finance",
    role: "FINANCE_REVIEWER",
    initials: "DO",
    color: "#3F7D5B",
    blurb: "Validates financial assumptions and adds concur / concern notes to packets.",
  },
  {
    id: "hannah",
    name: "Hannah Brooks",
    title: "Director, Commercial Strategy",
    role: "SALES_REVIEWER",
    initials: "HB",
    color: "#A86B3C",
    blurb: "Validates demand, pricing and channel assumptions on escalated cases.",
  },
  {
    id: "luis",
    name: "Luis Moreno",
    title: "Director, Supply Chain Operations",
    role: "OPERATIONS_REVIEWER",
    initials: "LM",
    color: "#4F6D8A",
    blurb: "Validates capacity, inventory and fulfillment assumptions.",
  },
  {
    id: "jordan",
    name: "Jordan Ellis",
    title: "AI Governance Administrator",
    role: "ADMIN",
    initials: "JE",
    color: "#4A4D52",
    blurb: "Maintains the rule catalog, thresholds and agent registry; verifies the audit chain. Cannot approve decisions.",
  },
];

export const OTHER_OWNERS = ["Marcus Hill", "Elena Ruiz", "Samuel Park"];

export const personaById = (id: string | undefined) => PERSONAS.find((p) => p.id === id);

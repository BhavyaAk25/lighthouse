// Demo personas (fictional people) for the role-based prototype.
// Five working roles: four department leads who each own an AI agent, and one executive who decides.
// A separate system administrator keeps the rules; they cannot decide (separation of duties).

import type { AgentType } from "./types";

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
  DECISION_OWNER: "Executive · Decision owner",
  SALES_REVIEWER: "Sales lead",
  FINANCE_REVIEWER: "Finance lead",
  OPERATIONS_REVIEWER: "Operations lead",
  LEGAL_REVIEWER: "Legal lead",
  ADMIN: "System administrator",
};

/** Which agent (department) each lead owns. */
export const DEPT_OF: Partial<Record<Role, AgentType>> = {
  SALES_REVIEWER: "SALES",
  FINANCE_REVIEWER: "FINANCE",
  OPERATIONS_REVIEWER: "OPERATIONS",
  LEGAL_REVIEWER: "LEGAL",
};

export const PERSONAS: Persona[] = [
  {
    id: "maya",
    name: "Maya Chen",
    title: "SVP, U.S. Merchandising",
    role: "DECISION_OWNER",
    initials: "MC",
    color: "#142B45",
    blurb: "Sees the reconciled packet once the four departments have signed off and makes the final call.",
  },
  {
    id: "hannah",
    name: "Hannah Brooks",
    title: "Director, Sales & Commercial",
    role: "SALES_REVIEWER",
    initials: "HB",
    color: "#A86B3C",
    blurb: "Proposes promotions and owns the Sales agent: demand, pricing and channel.",
  },
  {
    id: "david",
    name: "David Okafor",
    title: "Director, Merchandise Finance",
    role: "FINANCE_REVIEWER",
    initials: "DO",
    color: "#3F7D5B",
    blurb: "Owns the Finance agent: margin, ROI and break-even.",
  },
  {
    id: "luis",
    name: "Luis Moreno",
    title: "Director, Supply Chain Operations",
    role: "OPERATIONS_REVIEWER",
    initials: "LM",
    color: "#4F6D8A",
    blurb: "Owns the Operations agent: inventory, DC capacity and fulfillment.",
  },
  {
    id: "priya",
    name: "Priya Raman",
    title: "Senior Counsel, Compliance",
    role: "LEGAL_REVIEWER",
    initials: "PR",
    color: "#7A5C2A",
    blurb: "Owns the Legal agent: claims, privacy and state rules. Her block cannot be overruled.",
  },
  {
    id: "jordan",
    name: "Jordan Ellis",
    title: "AI Governance Administrator",
    role: "ADMIN",
    initials: "JE",
    color: "#4A4D52",
    blurb: "Keeps the rules, thresholds and AI settings; verifies the audit trail. Cannot decide cases.",
  },
];

export const EXECUTIVE = PERSONAS[0];

/** The department lead who owns each agent. */
export const LEAD_OF = Object.fromEntries(
  PERSONAS.filter((p) => DEPT_OF[p.role]).map((p) => [DEPT_OF[p.role]!, p]),
) as Record<AgentType, Persona>;

export const OTHER_OWNERS = ["Marcus Hill", "Elena Ruiz", "Samuel Park"];

export const personaById = (id: string | undefined) => PERSONAS.find((p) => p.id === id);

import type { Category, DataQuality, Dc, DecisionCase, Facts, LegalRule, Thresholds } from "../types";
import type { DemandProjection } from "./demand";

export interface EngineContext {
  c: DecisionCase;
  f: Facts;
  cat: Category;
  cfg: Thresholds;
  rules: LegalRule[];
  dcs: Dc[];
  runId: string;
  dq: DataQuality;
  demand: DemandProjection;
}

import type { Finding, ProjectContext } from '../types/index.js';
import { enrichFindings } from './enrichFindings.js';
import { attachRelatedFindings } from './relateFindings.js';

export function finalizeFindings(context: ProjectContext, findings: Finding[]): Finding[] {
  return attachRelatedFindings(enrichFindings(context, findings));
}

export type FindingCategory =
  | 'database'
  | 'async'
  | 'pooling'
  | 'dependencies'
  | 'redis'
  | 'architecture';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type EvidenceKind = 'confirmed' | 'potential';

export interface FindingEvidence {
  kind: EvidenceKind;
  snippet: string;
  detail?: string;
}

export type HotPath = 'request-handler' | 'loop' | 'startup' | 'module' | 'unknown';

export interface FindingLocation {
  file: string;
  line?: number;
  column?: number;
  enclosingFunction?: string;
  route?: { method?: string; path?: string };
  hotPath: HotPath;
}

export interface FindingTechnology {
  databases: string[];
  frameworks: string[];
  ruleFamily: string;
}

export interface Finding {
  id: string;
  /** Stable rule identifier, e.g. `db.mongo.n-plus-one`. */
  ruleId: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  file?: string;
  line?: number;
  column?: number;
  evidence: FindingEvidence;
  recommendation: string;
  /** 0–1. See docs/confidence.md for scoring bands. */
  confidence: number;
  /** Why this confidence band was chosen. */
  confidenceRationale?: string;
  estimatedImpact: string;
  location?: FindingLocation;
  technology?: FindingTechnology;
  /** Deterministic reason this pattern is likely expensive. Catalog, not an LLM. */
  costWhy?: string;
  relatedFindingIds?: string[];
  inspectNext?: string[];
}

export interface AnalysisSummary {
  totalFindings: number;
  bySeverity: Record<FindingSeverity, number>;
  byCategory: Record<string, number>;
  confirmedCount: number;
  potentialCount: number;
}

export interface AnalysisResult {
  findings: Finding[];
  summary: AnalysisSummary;
  metadata?: Record<string, unknown>;
}

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export interface SourceFileInfo {
  absolutePath: string;
  relativePath: string;
  content: string;
}

export interface ProjectConfig {
  skipPatterns: string[];
  extensions: string[];
  maxFileSizeBytes: number;
  maxSourceFiles: number;
}

export interface ProjectContext {
  projectPath: string;
  packageJson: PackageJson | null;
  sourceFiles: SourceFileInfo[];
  detectedTechnologies: string[];
  databases: string[];
  frameworks: string[];
  config: ProjectConfig;
}

export type InvestigationClusterReason = 'same-file' | 'same-route' | 'complementary-rules';

export interface InvestigationCluster {
  id: string;
  reason: InvestigationClusterReason;
  findingIds: string[];
  files: string[];
  technologies: string[];
}

export interface InvestigationHotspot {
  findingId: string;
  score: number;
  reasons: string[];
}

export interface InvestigationInspectNext {
  kind: 'finding' | 'file' | 'cluster';
  target: string;
  why: string;
}

export interface InvestigationSummary extends AnalysisSummary {
  clusterCount: number;
}

export interface InvestigationResult {
  projectPath: string;
  projectContext: {
    packageName: string | null;
    packageVersion: string | null;
    sourceFileCount: number;
    technologies: string[];
    databases: string[];
    frameworks: string[];
  };
  summary: InvestigationSummary;
  findings: Finding[];
  clusters: InvestigationCluster[];
  hotspots: InvestigationHotspot[];
  inspectNext: InvestigationInspectNext[];
}

export interface Analyzer {
  readonly name: string;
  analyze(context: ProjectContext): Promise<Finding[]>;
}

export interface GroupedFindings {
  byCategory: Record<string, Finding[]>;
  bySeverity: Record<FindingSeverity, Finding[]>;
  byFile: Record<string, Finding[]>;
}

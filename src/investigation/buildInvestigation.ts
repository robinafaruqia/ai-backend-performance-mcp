import type {
  Finding,
  FindingSeverity,
  InvestigationCluster,
  InvestigationHotspot,
  InvestigationInspectNext,
  InvestigationResult,
  ProjectContext,
} from '../types/index.js';
import { buildSummary } from '../models/Finding.js';
import { findingsRelated } from './relateFindings.js';

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function clusterTechnologies(findings: Finding[]): string[] {
  return uniqueSorted(
    findings.flatMap((finding) => [
      ...(finding.technology?.databases ?? []),
      ...(finding.technology?.frameworks ?? []),
    ]),
  );
}

export function buildClusters(findings: Finding[]): InvestigationCluster[] {
  const clusters: InvestigationCluster[] = [];
  const byFile = new Map<string, Finding[]>();
  const byRoute = new Map<string, Finding[]>();

  for (const finding of findings) {
    if (finding.file) {
      const list = byFile.get(finding.file) ?? [];
      list.push(finding);
      byFile.set(finding.file, list);
    }
    const routePath = finding.location?.route?.path;
    if (routePath) {
      const list = byRoute.get(routePath) ?? [];
      list.push(finding);
      byRoute.set(routePath, list);
    }
  }

  for (const [file, group] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length < 2) {
      continue;
    }
    const ids = group.map((item) => item.id).sort();
    clusters.push({
      id: `same-file:${file}`,
      reason: 'same-file',
      findingIds: ids,
      files: [file],
      technologies: clusterTechnologies(group),
    });
  }

  for (const [routePath, group] of [...byRoute.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length < 2) {
      continue;
    }
    const ids = group.map((item) => item.id).sort();
    clusters.push({
      id: `same-route:${routePath}`,
      reason: 'same-route',
      findingIds: ids,
      files: uniqueSorted(group.map((item) => item.file).filter((file): file is string => Boolean(file))),
      technologies: clusterTechnologies(group),
    });
  }

  const complementaryIds = new Set<string>();
  for (let i = 0; i < findings.length; i += 1) {
    for (let j = i + 1; j < findings.length; j += 1) {
      const a = findings[i];
      const b = findings[j];
      if (!a || !b) {
        continue;
      }
      const sameFile = Boolean(a.file && a.file === b.file);
      const sameFn =
        Boolean(a.location?.enclosingFunction) &&
        a.location?.enclosingFunction === b.location?.enclosingFunction &&
        a.file === b.file;
      const sameRoutePath = Boolean(
        a.location?.route?.path && a.location.route.path === b.location?.route?.path,
      );
      if (sameFile || sameFn || sameRoutePath) {
        continue;
      }
      if (findingsRelated(a, b)) {
        complementaryIds.add(a.id);
        complementaryIds.add(b.id);
      }
    }
  }

  if (complementaryIds.size >= 2) {
    const group = findings.filter((finding) => complementaryIds.has(finding.id));
    clusters.push({
      id: 'complementary-rules',
      reason: 'complementary-rules',
      findingIds: [...complementaryIds].sort(),
      files: uniqueSorted(group.map((item) => item.file).filter((file): file is string => Boolean(file))),
      technologies: clusterTechnologies(group),
    });
  }

  return clusters;
}

export function buildHotspots(findings: Finding[]): InvestigationHotspot[] {
  return findings
    .map((finding) => {
      const relatedCount = finding.relatedFindingIds?.length ?? 0;
      const score =
        Math.round(
          SEVERITY_WEIGHT[finding.severity] * finding.confidence * (1 + relatedCount) * 100,
        ) / 100;
      const reasons = [
        `severity:${finding.severity}`,
        `confidence:${finding.confidence}`,
        `related:${relatedCount}`,
      ];
      return { findingId: finding.id, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.findingId.localeCompare(b.findingId));
}

export function buildInspectNext(
  findings: Finding[],
  clusters: InvestigationCluster[],
  hotspots: InvestigationHotspot[],
): InvestigationInspectNext[] {
  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const items: InvestigationInspectNext[] = [];
  const seen = new Set<string>();

  for (const hotspot of hotspots.slice(0, 3)) {
    const finding = byId.get(hotspot.findingId);
    if (!finding) {
      continue;
    }
    const key = `finding:${finding.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push({
      kind: 'finding',
      target: finding.id,
      why: finding.costWhy ?? finding.title,
    });
  }

  for (const hotspot of hotspots.slice(0, 5)) {
    const finding = byId.get(hotspot.findingId);
    if (!finding?.file) {
      continue;
    }
    const key = `file:${finding.file}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push({
      kind: 'file',
      target: finding.file,
      why: `Contains hotspot ${finding.ruleId}; inspect the cited line and related findings in this file.`,
    });
  }

  const topCluster = clusters[0];
  if (topCluster) {
    const key = `cluster:${topCluster.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      items.push({
        kind: 'cluster',
        target: topCluster.id,
        why: `Related ${topCluster.reason} findings share ${topCluster.files.join(', ') || 'multiple files'}.`,
      });
    }
  }

  return items;
}

export function buildInvestigationResult(
  context: ProjectContext,
  findings: Finding[],
): InvestigationResult {
  const clusters = buildClusters(findings);
  const hotspots = buildHotspots(findings);
  const inspectNext = buildInspectNext(findings, clusters, hotspots);
  const summary = buildSummary(findings);

  return {
    projectPath: context.projectPath,
    projectContext: {
      packageName: context.packageJson?.name ?? null,
      packageVersion: context.packageJson?.version ?? null,
      sourceFileCount: context.sourceFiles.length,
      scan: context.scan,
      technologies: context.detectedTechnologies,
      databases: context.databases,
      frameworks: context.frameworks,
    },
    summary: {
      ...summary,
      clusterCount: clusters.length,
    },
    findings,
    clusters,
    hotspots,
    inspectNext,
  };
}

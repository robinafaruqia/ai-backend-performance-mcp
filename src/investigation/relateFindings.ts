import type { Finding } from '../types/index.js';

const RELATED_CAP = 8;

function isNPlusOne(ruleId: string): boolean {
  return ruleId.endsWith('.n-plus-one');
}

function complementary(a: Finding, b: Finding): boolean {
  const pair = (left: string, right: (id: string) => boolean): boolean =>
    (a.ruleId === left && right(b.ruleId)) || (b.ruleId === left && right(a.ruleId));

  return (
    pair('pooling.client-in-handler', isNPlusOne) ||
    pair('pooling.client-in-loop', isNPlusOne) ||
    pair('async.await-in-loop', isNPlusOne) ||
    pair('pooling.client-in-handler', (id) => id === 'async.await-in-loop') ||
    (a.ruleId === 'db.mongo.unbounded-find' && b.ruleId === 'db.mongo.index-not-in-source') ||
    (b.ruleId === 'db.mongo.unbounded-find' && a.ruleId === 'db.mongo.index-not-in-source')
  );
}

function sameRoute(a: Finding, b: Finding): boolean {
  const pathA = a.location?.route?.path;
  const pathB = b.location?.route?.path;
  return Boolean(pathA && pathB && pathA === pathB);
}

function sameFunction(a: Finding, b: Finding): boolean {
  const fnA = a.location?.enclosingFunction;
  const fnB = b.location?.enclosingFunction;
  return Boolean(fnA && fnB && fnA === fnB && a.file === b.file);
}

export function findingsRelated(a: Finding, b: Finding): boolean {
  if (a.id === b.id) {
    return false;
  }
  if (a.file && b.file && a.file === b.file) {
    return true;
  }
  if (sameFunction(a, b) || sameRoute(a, b)) {
    return true;
  }
  return complementary(a, b);
}

export function attachRelatedFindings(findings: Finding[]): Finding[] {
  return findings.map((finding) => {
    const related = findings
      .filter((other) => findingsRelated(finding, other))
      .map((other) => other.id)
      .sort();
    return {
      ...finding,
      relatedFindingIds: related.slice(0, RELATED_CAP),
    };
  });
}

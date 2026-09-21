// Canonical data layer. One source of truth for business facts, evidence and
// conflicts. Everything written here comes from data a collector actually
// observed — nothing is invented, and no value is stored without its origin.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Confidence = "verified" | "high" | "medium" | "low" | "unverified";

export interface FactInput {
  fieldKey: string;
  value: string;
  raw?: string | null;
  sourceProvider: string;
  sourceType: string;
  externalId?: string | null;
  sourceUrl?: string | null;
  confidence: Confidence;
  observedAt: string;
}

export interface FactChange {
  fieldKey: string;
  sourceProvider: string;
  previous: string;
  current: string;
}

/** Deterministic comparison form: case, spacing and punctuation noise removed. */
export function normalizeValue(fieldKey: string, value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (fieldKey === "phone") return trimmed.replace(/[^\d+]/g, "");
  if (fieldKey === "website" || fieldKey === "url") return trimmed.replace(/\/+$/, "").toLowerCase();
  return trimmed.toLowerCase();
}

/**
 * Upserts facts for one domain. Existing rows keep their history: when the
 * normalized value differs, the old value moves to previous_value and
 * changed_at is stamped. Unchanged facts only get a new last_verified_at.
 */
export async function upsertFacts(
  admin: SupabaseClient,
  workspaceId: string,
  domain: string,
  scanId: string,
  facts: FactInput[],
): Promise<FactChange[]> {
  if (!facts.length) return [];
  const { data: existing } = await admin
    .from("business_facts")
    .select("field_key,source_provider,value_normalized")
    .eq("workspace_id", workspaceId)
    .eq("domain", domain);
  const before = new Map(
    (existing ?? []).map((row: any) => [`${row.field_key}::${row.source_provider}`, String(row.value_normalized)]),
  );

  const changes: FactChange[] = [];
  const rows = facts.map((fact) => {
    const normalized = normalizeValue(fact.fieldKey, fact.value);
    const key = `${fact.fieldKey}::${fact.sourceProvider}`;
    const previous = before.get(key) ?? null;
    const changed = previous !== null && previous !== normalized;
    if (changed) changes.push({ fieldKey: fact.fieldKey, sourceProvider: fact.sourceProvider, previous: previous!, current: normalized });
    return {
      workspace_id: workspaceId,
      domain,
      field_key: fact.fieldKey,
      value_normalized: normalized,
      value_raw: fact.raw ?? fact.value,
      source_provider: fact.sourceProvider,
      source_type: fact.sourceType,
      external_id: fact.externalId ?? null,
      source_url: fact.sourceUrl ?? null,
      confidence: fact.confidence,
      retrieved_at: fact.observedAt,
      last_verified_at: fact.observedAt,
      scan_id: scanId,
      ...(changed ? { previous_value: previous, changed_at: fact.observedAt } : {}),
    };
  });

  await admin.from("business_facts").upsert(rows, { onConflict: "workspace_id,domain,field_key,source_provider" });
  return changes;
}

export interface ConflictRow {
  fieldKey: string;
  sourceA: string;
  valueA: string;
  observedAAt: string;
  sourceB: string;
  valueB: string;
  observedBAt: string;
}

/**
 * Two sources disagreeing about the same field is recorded as a conflict —
 * never silently resolved in favour of one source. Fields where every source
 * now agrees are marked resolved.
 */
export async function reconcileConflicts(
  admin: SupabaseClient,
  workspaceId: string,
  domain: string,
  scanId: string,
  facts: FactInput[],
): Promise<ConflictRow[]> {
  const byField = new Map<string, FactInput[]>();
  for (const fact of facts) {
    const list = byField.get(fact.fieldKey) ?? [];
    list.push(fact);
    byField.set(fact.fieldKey, list);
  }

  const conflicts: ConflictRow[] = [];
  for (const [fieldKey, list] of byField) {
    const sorted = [...list].sort((a, b) => a.sourceProvider.localeCompare(b.sourceProvider));
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        if (normalizeValue(fieldKey, a.value) === normalizeValue(fieldKey, b.value)) continue;
        conflicts.push({
          fieldKey,
          sourceA: a.sourceProvider,
          valueA: a.value,
          observedAAt: a.observedAt,
          sourceB: b.sourceProvider,
          valueB: b.value,
          observedBAt: b.observedAt,
        });
      }
    }
  }

  if (conflicts.length) {
    await admin.from("data_conflicts").upsert(
      conflicts.map((conflict) => ({
        workspace_id: workspaceId,
        domain,
        field_key: conflict.fieldKey,
        source_a: conflict.sourceA,
        value_a: conflict.valueA,
        observed_a_at: conflict.observedAAt,
        source_b: conflict.sourceB,
        value_b: conflict.valueB,
        observed_b_at: conflict.observedBAt,
        status: "open",
        resolved_at: null,
        scan_id: scanId,
        detected_at: new Date().toISOString(),
      })),
      { onConflict: "workspace_id,domain,field_key,source_a,source_b" },
    );
  }

  // Anything previously in conflict for a field that now agrees is resolved.
  const stillConflicting = new Set(conflicts.map((c) => `${c.fieldKey}::${c.sourceA}::${c.sourceB}`));
  const { data: openRows } = await admin
    .from("data_conflicts")
    .select("id,field_key,source_a,source_b")
    .eq("workspace_id", workspaceId)
    .eq("domain", domain)
    .eq("status", "open");
  const resolvable = (openRows ?? [])
    .filter((row: any) => byField.has(row.field_key) && !stillConflicting.has(`${row.field_key}::${row.source_a}::${row.source_b}`))
    .map((row: any) => row.id);
  if (resolvable.length) {
    await admin
      .from("data_conflicts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .in("id", resolvable);
  }

  return conflicts;
}

/**
 * Explodes each finding's stored evidence object into individual evidence
 * records, so every claim in a report can be traced back to one observation.
 */
export async function recordEvidence(
  admin: SupabaseClient,
  workspaceId: string,
  scanId: string,
  findings: { id: string; code: string; source: string; evidence: Record<string, unknown> | null }[],
) {
  const rows: Record<string, unknown>[] = [];
  const observedAt = new Date().toISOString();
  for (const finding of findings) {
    const evidence = finding.evidence ?? {};
    for (const [key, value] of Object.entries(evidence)) {
      if (value === null || value === undefined) continue;
      if (key === "source" || key === "collectedAt") continue;
      const printable = typeof value === "object" ? JSON.stringify(value) : String(value);
      if (!printable || printable === "{}" || printable === "[]") continue;
      rows.push({
        workspace_id: workspaceId,
        scan_id: scanId,
        finding_id: finding.id,
        source: finding.source,
        source_type: key,
        reference: finding.code,
        value: printable.slice(0, 4000),
        observed_at: observedAt,
      });
    }
  }
  if (!rows.length) return 0;
  await admin.from("finding_evidence").delete().eq("scan_id", scanId);
  await admin.from("finding_evidence").insert(rows);
  return rows.length;
}

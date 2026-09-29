import type { FilesystemPolicy } from "./filesystem";
import type { EvaluationRequest } from "./evaluator";

import type { Range } from "./source";
export type { Range } from "./source";
export type EvidenceRange = Range & { sourceByteStart?: number; sourceByteEnd?: number };
export type ReadingLead = {
  name: string;
  range: EvidenceRange;
  score: number;
};
export type FileEvidence = {
  path: string;
  contentHash: string;
  score: number;
  priority?: number;
  roles: string[];
  leads: ReadingLead[];
  selected: EvidenceRange[];
  rendered: EvidenceRange[];
  excerpts: Array<{
    range: EvidenceRange;
    source: string;
    sourceByteStart?: number;
    sourceByteEnd?: number;
    partial?: boolean;
  }>;
  presentationExcerpts?: FileEvidence["excerpts"];
  selectedPresentationExcerpts?: FileEvidence["excerpts"];
  presentationSelected?: EvidenceRange[];
  sourceDecisions?: Array<{ range: EvidenceRange; score: number }>;
  callLeads?: Array<{ caller: string; name: string; range: Range; unknownEarlierBases: string[] }>;
  sourceOmitted: boolean;
};
export type RetrievalResult = {
  root: string;
  query: string;
  status: "complete" | "incomplete" | "interrupted";
  files: FileEvidence[];
  issues: Array<{ kind: string; count: number }>;
  providerFailure?: string;
  warnings?: Array<{ kind: string; count: number }>;
  repositoryContext: {
    instructionFiles: string[];
    instructionLookupIncomplete: boolean;
  };
  counts: { requests: number; cacheHits: number; inspectedFiles: number };
};
export type SearchInput = {
  root: string;
  query: string;
  policy?: FilesystemPolicy;
  signal: AbortSignal;
  protectedPaths?: string[];
};
export type Evaluator = {
  readonly requests: number;
  readonly cacheHits?: number;
  readonly cacheIssues?: Array<{ kind: string; count: number }>;
  /** Validate sources before each transport attempt and before returning a cached answer. */
  evaluate(
    request: EvaluationRequest,
    policy?: { navigation?: boolean; beforeAttempt?: () => Promise<void> },
  ): Promise<Record<string, number>>;
};

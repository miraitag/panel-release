/**
 * Shared Kernel (DDD): contratos que viajan por HTTP/SSE entre server y web.
 * Se definen con zod para validar en ambos extremos y derivar los tipos.
 */
import { z } from 'zod';

export const PackageManagerSchema = z.enum(['pnpm', 'npm']);
export type PackageManager = z.infer<typeof PackageManagerSchema>;

export const BumpSchema = z.enum(['patch', 'minor', 'major']);
export type Bump = z.infer<typeof BumpSchema>;

export const LibStatusSchema = z.enum([
  'up-to-date',
  'pending-publish',
  'wrapper-outdated',
  'major-review',
  'unknown',
]);
export type LibStatus = z.infer<typeof LibStatusSchema>;

export const LineSchema = z.object({ code: z.string(), color: z.string() });
export type Line = z.infer<typeof LineSchema>;

export const LibraryStateSchema = z.object({
  name: z.string(),
  repo: z.string(),
  line: LineSchema,
  packageManager: PackageManagerSchema.nullable(),
  repoVersion: z.string().nullable(),
  publishedVersion: z.string().nullable(),
  wrapperVersion: z.string().nullable(),
  pendingChangesets: z.number().int().nonnegative(),
  suggestedBump: BumpSchema.nullable(),
  status: LibStatusSchema,
  error: z.string().nullable(),
});
export type LibraryState = z.infer<typeof LibraryStateSchema>;

export const LibrariesResponseSchema = z.object({
  checkedAt: z.string(),
  libraries: z.array(LibraryStateSchema),
});
export type LibrariesResponse = z.infer<typeof LibrariesResponseSchema>;

export const ChangesetSchema = z.object({ id: z.string(), bump: BumpSchema, summary: z.string() });
export type Changeset = z.infer<typeof ChangesetSchema>;

export const ChangesetsResponseSchema = z.object({
  name: z.string(),
  changesets: z.array(ChangesetSchema),
  suggestedBump: BumpSchema.nullable(),
});
export type ChangesetsResponse = z.infer<typeof ChangesetsResponseSchema>;

export const StepKeySchema = z.enum([
  'clone',
  'preflight',
  'install',
  'adjust-bump',
  'bump',
  'verify',
  'tag',
  'jenkins',
  'registry',
]);
export type StepKey = z.infer<typeof StepKeySchema>;

export const StepStateSchema = z.enum([
  'pending',
  'running',
  'done',
  'failed',
  'external',
  'timeout',
  'skipped',
  'cancelled',
]);
export type StepState = z.infer<typeof StepStateSchema>;

export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'timeout',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobStepSchema = z.object({
  key: StepKeySchema,
  state: StepStateSchema,
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  detail: z.string().nullable(),
});
export type JobStep = z.infer<typeof JobStepSchema>;

export const JobSchema = z.object({
  id: z.string(),
  library: z.string(),
  line: LineSchema,
  from: z.string(),
  to: z.string(),
  bump: BumpSchema,
  status: JobStatusSchema,
  steps: z.array(JobStepSchema),
  createdBy: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  result: z.object({ tag: z.string().optional(), commit: z.string().optional() }).nullable(),
  error: z.string().nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export const JobListResponseSchema = z.object({ jobs: z.array(JobSchema) });

export const JobEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('log'), line: z.string(), ts: z.string() }),
  z.object({ type: z.literal('step'), key: StepKeySchema, state: StepStateSchema, ts: z.string() }),
  z.object({ type: z.literal('job'), job: JobSchema }),
]);
export type JobEvent = z.infer<typeof JobEventSchema>;

export const StartReleaseRequestSchema = z.object({
  items: z
    .array(z.object({ name: z.string().min(1), bump: BumpSchema }))
    .min(1, 'Elige al menos una librería'),
});
export type StartReleaseRequest = z.infer<typeof StartReleaseRequestSchema>;

export const StartReleaseResponseSchema = z.object({ jobIds: z.array(z.string()) });
export type StartReleaseResponse = z.infer<typeof StartReleaseResponseSchema>;

export const WrapperDepSchema = z.object({
  name: z.string(),
  line: LineSchema,
  current: z.string().nullable(),
  target: z.string().nullable(),
  peerReactNative: z.string().nullable(),
  compatible: z.boolean(),
  isMajor: z.boolean(),
  upToDate: z.boolean(),
  note: z.string().nullable(),
});
export type WrapperDep = z.infer<typeof WrapperDepSchema>;

export const WrapperStatusSchema = z.object({
  repo: z.string(),
  packageManager: PackageManagerSchema.nullable(),
  reactNativeVersion: z.string().nullable(),
  brownfieldVersion: z.string().nullable(),
  deps: z.array(WrapperDepSchema),
});
export type WrapperStatus = z.infer<typeof WrapperStatusSchema>;

export const SyncWrapperRequestSchema = z.object({
  specs: z
    .array(z.object({ name: z.string(), version: z.string() }))
    .min(1, 'Marca al menos una librería'),
  allowMajor: z.boolean().default(false),
});
export type SyncWrapperRequest = z.infer<typeof SyncWrapperRequestSchema>;

export const SyncWrapperResponseSchema = z.object({
  branch: z.string(),
  pullRequestUrl: z.string().nullable(),
  specs: z.array(z.string()),
});
export type SyncWrapperResponse = z.infer<typeof SyncWrapperResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

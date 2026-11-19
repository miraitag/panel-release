/**
 * Composition Root: el ÚNICO lugar que conoce las clases concretas.
 * Aquí se elige la familia de adaptadores (Abstract Factory): reales o mock.
 */
import { resolve } from 'node:path';
import type { Env } from '../config/env';
import type { Catalog } from '../domain/catalog';
import type {
  GitPort,
  Logger,
  PackageRegistry,
  ProcessRunner,
  PullRequestGateway,
  RepoReader,
} from '../domain/ports';
import { DefaultStatusPolicy } from '../domain/status-policy';
import { JobRunner } from '../application/release/job-runner';
import { ReleasePipeline } from '../application/release/pipeline';
import {
  AdjustBumpStep,
  AwaitRegistryStep,
  BumpStep,
  CloneStep,
  InstallStep,
  JenkinsStep,
  PreflightStep,
  TagStep,
  VerifyStep,
  type ReleaseSettings,
} from '../application/release/steps';
import { GetChangesets, GetLibrariesStatus } from '../application/use-cases/libraries';
import { CancelJob, GetJob, ListJobs, StartRelease } from '../application/use-cases/releases';
import { GetWrapperStatus, SyncWrapper } from '../application/use-cases/wrapper';
import { createBitbucket } from '../infrastructure/bitbucket/bitbucket';
import { loadCatalog } from '../infrastructure/catalog-loader';
import { GitCli } from '../infrastructure/git/git-cli';
import {
  MockGit,
  MockProcessRunner,
  MockPullRequests,
  MockRegistry,
  MockRepoReader,
  MockWorld,
} from '../infrastructure/mock/mock-world';
import { LockfilePackageManagerResolver } from '../infrastructure/package-manager/strategies';
import { NodeProcessRunner, SecretMasker } from '../infrastructure/process/node-process-runner';
import { NpmViewRegistry } from '../infrastructure/registry/npm-registry';
import {
  DailySequenceIds,
  FsWorkspace,
  InMemoryEventBus,
  InMemoryJobRepository,
  SystemClock,
  attachJsonlAudit,
} from '../infrastructure/runtime';

interface AdapterFamily {
  world?: MockWorld;
  reader: RepoReader;
  registry: PackageRegistry;
  runner: ProcessRunner;
  git: GitPort;
  prs: PullRequestGateway;
  pollIntervalMs: number;
}

function realAdapters(env: Env): AdapterFamily {
  const masker = new SecretMasker([env.ARTIFACTORY_TOKEN, env.BITBUCKET_TOKEN]);
  const runner = new NodeProcessRunner(masker);
  const bitbucket = createBitbucket(env.BITBUCKET_FLAVOR, {
    apiUrl: env.BITBUCKET_API_URL,
    workspace: env.BITBUCKET_WORKSPACE,
    token: env.BITBUCKET_TOKEN,
    mainBranch: env.BITBUCKET_MAIN_BRANCH,
  });
  return {
    reader: bitbucket,
    prs: bitbucket,
    runner,
    registry: new NpmViewRegistry(runner, env.ARTIFACTORY_NPM_URL, process.cwd()),
    git: new GitCli(runner, env.GIT_REMOTE_TEMPLATE, env.BITBUCKET_WORKSPACE, gitIdentity(env)),
    pollIntervalMs: env.POLL_INTERVAL_MS,
  };
}

export interface MockTiming {
  publishDelayMs: number;
  pollIntervalMs: number;
}

function mockAdapters(catalog: Catalog, t: MockTiming): AdapterFamily & { world: MockWorld } {
  const world = new MockWorld(catalog.wrapper.repo, t.publishDelayMs);
  return {
    world,
    reader: new MockRepoReader(world),
    registry: new MockRegistry(world),
    runner: new MockProcessRunner(world),
    git: new MockGit(world),
    prs: new MockPullRequests(world),
    pollIntervalMs: t.pollIntervalMs,
  };
}

function gitIdentity(env: Env): Record<string, string> {
  return {
    GIT_AUTHOR_NAME: env.GIT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL: env.GIT_AUTHOR_EMAIL,
    GIT_COMMITTER_NAME: env.GIT_AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: env.GIT_AUTHOR_EMAIL,
  };
}

export function buildContainer(
  env: Env,
  logger: Logger,
  rootDir: string,
  mockTiming: MockTiming = { publishDelayMs: 6_000, pollIntervalMs: 1_500 },
) {
  const catalog = loadCatalog(resolve(rootDir, env.LIBRARIES_CONFIG));
  const a = env.MOCK_MODE ? mockAdapters(catalog, mockTiming) : realAdapters(env);

  const clock = new SystemClock();
  const jobs = new InMemoryJobRepository();
  const events = new InMemoryEventBus();
  const workspace = new FsWorkspace(resolve(rootDir, env.WORK_DIR));
  const pmResolver = new LockfilePackageManagerResolver(a.runner);
  attachJsonlAudit(events, resolve(rootDir, env.AUDIT_DIR));

  const settings: ReleaseSettings = {
    mainBranch: env.BITBUCKET_MAIN_BRANCH,
    tagFormat: env.TAG_FORMAT,
    pollIntervalMs: a.pollIntervalMs,
    pollAttempts: env.POLL_ATTEMPTS,
    gitEnv: gitIdentity(env),
  };

  const pipeline = new ReleasePipeline(
    [
      new CloneStep(workspace, a.git, settings),
      new PreflightStep(a.git, a.registry, workspace, settings),
      new InstallStep(pmResolver),
      new AdjustBumpStep(workspace),
      new BumpStep(workspace),
      new VerifyStep(),
      new TagStep(settings),
      new JenkinsStep(),
      new AwaitRegistryStep(a.registry, settings),
    ],
    { jobs, events, clock, workspace, logger },
  );
  const runner = new JobRunner(pipeline);

  const getChangesets = new GetChangesets(catalog, a.reader);
  const getLibraries = new GetLibrariesStatus(
    catalog,
    a.reader,
    a.registry,
    pmResolver,
    getChangesets,
    new DefaultStatusPolicy(),
    clock,
  );
  // Cuando un job termina, el mapa debe recalcularse.
  events.subscribeAll((_id, e) => {
    if (e.type === 'job' && !['queued', 'running'].includes(e.job.status))
      getLibraries.invalidate();
  });
  const getWrapper = new GetWrapperStatus(catalog, a.reader, a.registry, pmResolver);

  return {
    env,
    catalog,
    events,
    runner,
    world: a.world ?? null,
    useCases: {
      getLibraries,
      getChangesets,
      startRelease: new StartRelease(
        catalog,
        a.reader,
        jobs,
        runner,
        new DailySequenceIds(),
        clock,
        () => getLibraries.invalidate(),
      ),
      getJob: new GetJob(jobs),
      listJobs: new ListJobs(jobs),
      cancelJob: new CancelJob(jobs, runner),
      getWrapper,
      syncWrapper: new SyncWrapper(
        catalog,
        getWrapper,
        a.registry,
        workspace,
        a.git,
        pmResolver,
        a.prs,
        clock,
        logger,
        env.BITBUCKET_MAIN_BRANCH,
        () => getLibraries.invalidate(),
      ),
    },
  };
}

export type Container = ReturnType<typeof buildContainer>;

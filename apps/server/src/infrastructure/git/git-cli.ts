import type { GitPort, ProcessRunner, RunOptions } from '../../domain/ports';

/** Adapter de git sobre la CLI. El remoto se arma con GIT_REMOTE_TEMPLATE. */
export class GitCli implements GitPort {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly remoteTemplate: string,
    private readonly workspaceName: string,
    private readonly identity: Record<string, string>,
  ) {}

  private remote(repo: string): string {
    return this.remoteTemplate
      .replaceAll('{workspace}', this.workspaceName)
      .replaceAll('{repo}', repo);
  }

  private quiet(dir: string): RunOptions {
    return { cwd: dir };
  }

  async clone(repo: string, dir: string, branch: string, opts: RunOptions): Promise<void> {
    await this.runner.run(
      'git',
      ['clone', '--depth', '50', '--branch', branch, this.remote(repo), '.'],
      {
        ...opts,
        cwd: dir,
      },
    );
  }

  async currentBranch(dir: string): Promise<string> {
    const r = await this.runner.run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], this.quiet(dir));
    return r.stdout.trim();
  }

  async isClean(dir: string): Promise<boolean> {
    const r = await this.runner.run('git', ['status', '--porcelain'], this.quiet(dir));
    return r.stdout.trim() === '';
  }

  async remoteTagExists(dir: string, tag: string): Promise<boolean> {
    const r = await this.runner.run(
      'git',
      ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`],
      this.quiet(dir),
    );
    return r.stdout.trim() !== '';
  }

  async checkoutNewBranch(dir: string, branch: string, opts: RunOptions): Promise<void> {
    await this.runner.run('git', ['checkout', '-b', branch], { ...opts, cwd: dir });
  }

  async commit(
    dir: string,
    message: string,
    paths: readonly string[],
    opts: RunOptions,
  ): Promise<string> {
    const env = { ...this.identity, ...opts.env };
    await this.runner.run('git', ['add', ...paths], { ...opts, cwd: dir, env });
    await this.runner.run('git', ['commit', '-m', message], { ...opts, cwd: dir, env });
    const r = await this.runner.run('git', ['rev-parse', '--short', 'HEAD'], this.quiet(dir));
    return r.stdout.trim();
  }

  async push(dir: string, branch: string, opts: RunOptions): Promise<void> {
    await this.runner.run('git', ['push', '-u', 'origin', branch], { ...opts, cwd: dir });
  }
}

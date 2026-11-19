import type { PullRequestGateway, RepoReader } from '../../domain/ports';

export interface BitbucketSettings {
  apiUrl: string;
  workspace: string;
  token: string;
  mainBranch: string;
}

abstract class BitbucketHttp {
  constructor(protected readonly s: BitbucketSettings) {}

  protected async request(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${this.s.apiUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.s.token}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    return res;
  }

  protected async fail(res: Response, what: string): Promise<never> {
    throw new Error(`Bitbucket ${what}: ${res.status} ${await res.text().catch(() => '')}`);
  }
}

/** Bitbucket Cloud · API 2.0 */
export class BitbucketCloud extends BitbucketHttp implements RepoReader, PullRequestGateway {
  private src(repo: string, path: string) {
    return `/repositories/${this.s.workspace}/${repo}/src/${this.s.mainBranch}/${path}`;
  }

  async readText(repo: string, path: string): Promise<string | null> {
    const res = await this.request(this.src(repo, path), { headers: { Accept: 'text/plain' } });
    if (res.status === 404) return null;
    if (!res.ok) return this.fail(res, `leer ${repo}/${path}`);
    return res.text();
  }

  async listDir(repo: string, path: string): Promise<string[]> {
    const dir = path ? `${path.replace(/\/$/, '')}/` : '';
    const res = await this.request(`${this.src(repo, dir)}?pagelen=100`);
    if (res.status === 404) return [];
    if (!res.ok) return this.fail(res, `listar ${repo}/${path}`);
    const body = (await res.json()) as { values?: { path: string }[] };
    return (body.values ?? []).map((v) => v.path.split('/').pop() ?? v.path);
  }

  async open(input: {
    repo: string;
    branch: string;
    target: string;
    title: string;
    description: string;
  }) {
    const res = await this.request(`/repositories/${this.s.workspace}/${input.repo}/pullrequests`, {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        source: { branch: { name: input.branch } },
        destination: { branch: { name: input.target } },
        close_source_branch: true,
      }),
    });
    if (!res.ok) return this.fail(res, 'abrir PR');
    const pr = (await res.json()) as { links?: { html?: { href?: string } } };
    return { url: pr.links?.html?.href ?? null };
  }
}

/** Bitbucket Data Center · REST 1.0. `workspace` = clave del proyecto. [CONFIRMAR] */
export class BitbucketDataCenter extends BitbucketHttp implements RepoReader, PullRequestGateway {
  private base(repo: string) {
    return `/rest/api/1.0/projects/${this.s.workspace}/repos/${repo}`;
  }

  async readText(repo: string, path: string): Promise<string | null> {
    const res = await this.request(
      `${this.base(repo)}/raw/${path}?at=refs/heads/${this.s.mainBranch}`,
      {
        headers: { Accept: 'text/plain' },
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) return this.fail(res, `leer ${repo}/${path}`);
    return res.text();
  }

  async listDir(repo: string, path: string): Promise<string[]> {
    const res = await this.request(
      `${this.base(repo)}/browse/${path}?at=refs/heads/${this.s.mainBranch}&limit=500`,
    );
    if (res.status === 404) return [];
    if (!res.ok) return this.fail(res, `listar ${repo}/${path}`);
    const body = (await res.json()) as { children?: { values?: { path: { name: string } }[] } };
    return (body.children?.values ?? []).map((v) => v.path.name);
  }

  async open(input: {
    repo: string;
    branch: string;
    target: string;
    title: string;
    description: string;
  }) {
    const ref = (b: string) => ({
      id: `refs/heads/${b}`,
      repository: { slug: input.repo, project: { key: this.s.workspace } },
    });
    const res = await this.request(`${this.base(input.repo)}/pull-requests`, {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        fromRef: ref(input.branch),
        toRef: ref(input.target),
      }),
    });
    if (!res.ok) return this.fail(res, 'abrir PR');
    const pr = (await res.json()) as { links?: { self?: { href?: string }[] } };
    return { url: pr.links?.self?.[0]?.href ?? null };
  }
}

/** Factory: elige el adapter según BITBUCKET_FLAVOR. */
export function createBitbucket(flavor: 'cloud' | 'datacenter', s: BitbucketSettings) {
  return flavor === 'cloud' ? new BitbucketCloud(s) : new BitbucketDataCenter(s);
}

import { spawn } from 'node:child_process';
import { CancelledError, StepFailedError } from '../../domain/errors';
import type { ProcessRunner, RunOptions, RunResult } from '../../domain/ports';

/** Reemplaza secretos conocidos por *** antes de que lleguen a logs o SSE. */
export class SecretMasker {
  private readonly secrets: string[];
  constructor(secrets: readonly (string | undefined)[]) {
    this.secrets = secrets.filter((s): s is string => !!s && s.length >= 4);
  }
  mask(text: string): string {
    return this.secrets.reduce((acc, s) => acc.split(s).join('***'), text);
  }
}

/** En Windows npm/pnpm/npx son .cmd. */
export function resolveBin(cmd: string): string {
  return process.platform === 'win32' && ['npm', 'pnpm', 'npx'].includes(cmd) ? `${cmd}.cmd` : cmd;
}

/**
 * Adapter de ProcessRunner sobre child_process.spawn.
 * shell:false + argumentos en arreglo = sin inyección de comandos.
 */
export class NodeProcessRunner implements ProcessRunner {
  constructor(private readonly masker: SecretMasker) {}

  run(cmd: string, args: readonly string[], opts: RunOptions): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      if (opts.signal?.aborted) return reject(new CancelledError('Cancelado'));
      opts.onLine?.(this.masker.mask(`$ ${cmd} ${args.join(' ')}`));
      const child = spawn(resolveBin(cmd), [...args], {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env, CI: 'true', FORCE_COLOR: '0' },
        shell: false,
        signal: opts.signal,
      });
      let stdout = '';
      let lastLine = '';
      let buffer = '';
      const onData = (chunk: Buffer, isStdout: boolean) => {
        const text = chunk.toString();
        if (isStdout) stdout += text;
        buffer += text;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const l of lines) {
          if (!l.trim()) continue;
          if (isStdout) lastLine = l;
          opts.onLine?.(this.masker.mask(l));
        }
      };
      child.stdout.on('data', (c: Buffer) => onData(c, true));
      child.stderr.on('data', (c: Buffer) => onData(c, false));
      child.on('error', (err) => {
        if (err.name === 'AbortError') reject(new CancelledError('Cancelado'));
        else reject(new StepFailedError(`No se pudo ejecutar ${cmd}: ${err.message}`));
      });
      child.on('close', (code) => {
        if (buffer.trim()) {
          lastLine = buffer.trim();
          opts.onLine?.(this.masker.mask(buffer.trim()));
        }
        if (code === 0) resolve({ stdout, lastLine });
        else reject(new StepFailedError(`${cmd} ${args.join(' ')} terminó con código ${code}`));
      });
    });
  }
}

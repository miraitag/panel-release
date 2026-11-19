import type { CSSProperties, ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import type { Line } from '@release-panel/shared';

/** Componentes de presentación puros: sin estado de negocio ni llamadas a la API. */

const NAV = [
  { to: '/', label: 'Librerías', end: true },
  { to: '/release', label: 'Releases' },
  { to: '/jobs', label: 'Procesos' },
  { to: '/wrapper', label: 'Wrapper' },
];

export function AppShell({ children, mock }: { children: ReactNode; mock: boolean }) {
  return (
    <>
      <header className="shell-header">
        <div className="shell-header__in">
          <Link to="/" className="brand">
            <span className="brand__ring" aria-hidden="true" />
            Release Panel
            {mock && <span className="mock-flag">Modo demo</span>}
          </Link>
          <nav aria-label="Principal" className="navline">
            {NAV.map((n, i) => (
              <span key={n.to} style={{ display: 'contents' }}>
                {i > 0 && <span className="navline__rail" aria-hidden="true" />}
                <NavLink to={n.to} end={n.end} className="navline__link">
                  <span className="navline__dot" aria-hidden="true" />
                  {n.label}
                </NavLink>
              </span>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}

export function PageHead({
  title,
  intro,
  actions,
}: {
  title: string;
  intro?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

export function LineBadge({ line, small }: { line: Line; small?: boolean }) {
  const style: CSSProperties = {
    background: line.color,
    ...(small ? { minWidth: 40, height: 28, fontSize: 13 } : {}),
  };
  return (
    <span className="line-badge" style={style}>
      {line.code}
    </span>
  );
}

export function Station({ color, on, big }: { color: string; on: boolean; big?: boolean }) {
  return (
    <span
      className={`station${big ? ' station--big' : ''}`}
      style={on ? { borderColor: color } : undefined}
      aria-hidden="true"
    />
  );
}

export function Segment({ color, reached }: { color: string; reached: boolean }) {
  return reached ? (
    <span className="segment" style={{ background: color }} aria-hidden="true" />
  ) : (
    <span
      className="segment segment--dashed"
      style={{ '--seg-color': color } as CSSProperties}
      aria-hidden="true"
    />
  );
}

export type SignalKind = 'ok' | 'info' | 'warn' | 'stop' | 'off';

export function Notice({ kind, children }: { kind: SignalKind; children: ReactNode }) {
  return (
    <div className="notice">
      <span className={`signal signal--${kind}`} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Algo salió mal.';
  return (
    <div className="banner" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn--link" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

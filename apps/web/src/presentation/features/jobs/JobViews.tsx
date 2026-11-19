import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorBanner, LineBadge, Notice, PageHead, Skeleton } from '../../design-system/components';
import { useJobsListViewModel, useJobViewModel } from './useJobViewModel';

export function JobView() {
  const { id = '' } = useParams();
  const vm = useJobViewModel(id);

  if (vm.isLoading)
    return (
      <main className="page">
        <Skeleton rows={6} />
      </main>
    );
  if (!vm.job)
    return (
      <main className="page">
        <ErrorBanner error={vm.error ?? new Error('No existe ese recorrido.')} />
      </main>
    );
  const { job } = vm;

  return (
    <main className="page" style={{ '--line': job.line.color } as CSSProperties}>
      <div className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <LineBadge line={job.line} />
          <div>
            <h1 style={{ margin: 0, fontSize: 'clamp(30px,4vw,44px)', fontWeight: 800 }}>
              {vm.title}
            </h1>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {job.id}, iniciado por {job.createdBy}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <strong style={{ color: vm.status?.color }}>
            {vm.isActive && vm.waitingOn ? `En curso: ${vm.waitingOn}` : vm.status?.label}
          </strong>
          {vm.isActive && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={vm.cancel}
              disabled={vm.isCancelling}
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {vm.error && <ErrorBanner error={vm.error} />}
      {job.error && job.status !== 'cancelled' && <ErrorBanner error={new Error(job.error)} />}
      {vm.streamLost && vm.isActive && (
        <Notice kind="warn">Se perdió la conexión en vivo; reintentando…</Notice>
      )}

      <div className="split">
        <section style={{ flex: '1 1 380px', minWidth: 0 }} aria-labelledby="t-route">
          <h2 id="t-route" style={{ margin: '0 0 20px', fontSize: 22 }}>
            Recorrido
          </h2>
          <ol className="route">
            {vm.route.map((s) => (
              <li key={s.key} className="route__item">
                <div className="route__axis">
                  <span className={`route__dot route__dot--${s.dot}`} aria-hidden="true" />
                  {s.line !== 'none' && (
                    <span className={`route__line route__line--${s.line}`} aria-hidden="true" />
                  )}
                </div>
                <div className="route__body">
                  <div className="route__title">
                    <span
                      style={{
                        fontWeight: s.dot === 'running' ? 800 : 600,
                        color: s.dot === 'pending' ? 'var(--gris-senal)' : undefined,
                      }}
                    >
                      {s.title}
                    </span>
                    <span className="mono muted" style={{ fontSize: 14 }}>
                      {s.duration}
                    </span>
                  </div>
                  <span className="mono" style={{ fontSize: 13.5, color: 'var(--tinta-2)' }}>
                    {s.cmd}
                  </span>
                  <span className="muted" style={{ fontSize: 14 }}>
                    {s.stateLabel}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section
          style={{
            flex: '999 1 620px',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <div className="code">
            <h2>Bitácora en vivo</h2>
            <pre aria-live="polite">{vm.logs || 'Esperando salida…'}</pre>
          </div>
          <dl className="facts">
            <div>
              <dt>Tag</dt>
              <dd>{job.result?.tag ?? '—'}</dd>
            </div>
            <div>
              <dt>Commit</dt>
              <dd>{job.result?.commit ?? '—'}</dd>
            </div>
            <div>
              <dt>Tipo de cambio</dt>
              <dd>{job.bump}</dd>
            </div>
          </dl>
          {job.status === 'succeeded' && (
            <Link to="/wrapper" className="btn" style={{ alignSelf: 'flex-start' }}>
              Llevar {job.to} al wrapper
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}

export function JobsListView() {
  const vm = useJobsListViewModel();
  return (
    <main className="page">
      <PageHead
        title="Recorridos"
        intro="Cada release es un recorrido por las estaciones. Abre uno para ver su bitácora en vivo."
      />
      {vm.error && <ErrorBanner error={vm.error} />}
      {vm.isLoading && <Skeleton rows={3} />}
      {!vm.isLoading && vm.rows.length === 0 && (
        <Notice kind="info">
          Aún no hay recorridos en esta sesión. <Link to="/release">Inicia un release</Link>.
        </Notice>
      )}
      <div className="rows">
        {vm.rows.map((r) => (
          <Link key={r.id} to={`/jobs/${r.id}`} className="rows__row">
            <span className="mono" style={{ fontSize: 14 }}>
              {r.id}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LineBadge line={r.line} small />
              {r.title}
            </span>
            <span className="mono">{r.tag}</span>
            <span className="muted">{r.createdAt}</span>
            <strong style={{ color: r.status.color }}>{r.status.label}</strong>
          </Link>
        ))}
      </div>
    </main>
  );
}

import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Bump } from '@release-panel/shared';
import { ErrorBanner, LineBadge, Notice, PageHead, Skeleton } from '../../design-system/components';
import { BUMP_HINT, useReleaseViewModel } from './useReleaseViewModel';

const BUMPS: Bump[] = ['patch', 'minor', 'major'];

export function ReleaseView() {
  const vm = useReleaseViewModel();

  return (
    <main className="page">
      <PageHead
        title="Nuevo release"
        intro="Recorre las cuatro estaciones: eliges librerías, decides el tipo de cambio, validas y subes el tag, y al final llevas las versiones al wrapper."
      />

      <nav aria-label="Pasos del release" style={{ overflowX: 'auto' }}>
        <ol className="steps">
          {vm.steps.map((s, i) => {
            const current = s.n === vm.step;
            const done = s.n < vm.step;
            const left = i === 0 ? 'none' : s.n <= vm.step ? 'on' : '';
            const right = i === vm.steps.length - 1 ? 'none' : s.n < vm.step ? 'on' : '';
            return (
              <li key={s.n} className="steps__item">
                <div className="steps__track">
                  <span className={`steps__rail ${left ? `steps__rail--${left}` : ''}`} />
                  <button
                    type="button"
                    aria-label={s.title}
                    aria-current={current ? 'step' : undefined}
                    className={`steps__dot${done ? ' steps__dot--done' : ''}${current ? ' steps__dot--current' : ''}`}
                    onClick={() => vm.goTo(s.n)}
                  />
                  <span className={`steps__rail ${right ? `steps__rail--${right}` : ''}`} />
                </div>
                <button
                  type="button"
                  className="steps__label"
                  style={{ fontWeight: current ? 800 : 600 }}
                  onClick={() => vm.goTo(s.n)}
                >
                  {s.title}
                  <small>{s.sub}</small>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {vm.error && <ErrorBanner error={vm.error} />}

      <div className="split">
        <section
          className="split__main"
          style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
        >
          {vm.step === 1 && (
            <div>
              <h2 style={{ fontSize: 26, margin: '0 0 12px' }}>
                ¿Qué librerías salen en este release?
              </h2>
              {vm.isLoading && <Skeleton rows={4} />}
              {vm.candidates.map((c) => (
                <label key={c.name} className="choice">
                  <input type="checkbox" checked={c.selected} onChange={() => vm.toggle(c.name)} />
                  <LineBadge line={c.line} />
                  <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <strong style={{ fontSize: 17 }}>{c.shortName}</strong>
                    <span className="muted" style={{ fontSize: 14 }}>
                      {c.summary}. Versión actual <span className="mono">{c.from}</span>
                    </span>
                  </span>
                  <span className="mono muted">{c.pm}</span>
                </label>
              ))}
            </div>
          )}

          {vm.step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              <div>
                <h2 style={{ fontSize: 26, margin: 0 }}>Tipo de cambio por librería</h2>
                <p className="muted" style={{ margin: '6px 0 0' }}>
                  La sugerencia viene de los changesets del repo. Si eliges otro tipo, el panel
                  ajusta el changeset antes de generar la versión.
                </p>
              </div>
              {vm.chosen.length === 0 && (
                <Notice kind="info">Primero elige al menos una librería.</Notice>
              )}
              {vm.chosen.map((c) => (
                <div
                  key={c.name}
                  className="rail-block"
                  style={{ '--line': c.line.color } as CSSProperties}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <LineBadge line={c.line} />
                      <strong style={{ fontSize: 19 }}>{c.shortName}</strong>
                    </span>
                    <span className="version-jump">
                      <span className="muted">{c.from}</span>
                      <span className="version-jump__rail" aria-hidden="true" />
                      <strong>{c.to}</strong>
                    </span>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label={`Tipo de cambio para ${c.shortName}`}
                    className="pills"
                  >
                    {BUMPS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        role="radio"
                        aria-checked={c.bump === b}
                        className="pill"
                        onClick={() => vm.setBump(c.name, b)}
                      >
                        {b}
                        <small>{BUMP_HINT[b]}</small>
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--tinta-2)' }}>
                    {c.changelog.map((l) => (
                      <div key={l}>{l}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {vm.step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontSize: 26, margin: 0 }}>Validar y subir el tag</h2>
              <p className="muted" style={{ margin: 0 }}>
                Mientras algo falle aquí no se crea ningún tag. Subir el tag es el último paso que
                controla el panel.
              </p>
              <ul className="checklist">
                <li>
                  <span className="signal signal--off" aria-hidden="true" />
                  Rama main limpia y al día con origin
                </li>
                <li>
                  <span className="signal signal--off" aria-hidden="true" />
                  Versión esperada en package.json y tag inexistente
                </li>
                <li>
                  <span className="signal signal--off" aria-hidden="true" />
                  Instalación con el lockfile del repo
                </li>
                <li>
                  <span className="signal signal--off" aria-hidden="true" />
                  Lint, typecheck, pruebas y build
                </li>
              </ul>
              <button
                type="button"
                className="btn"
                style={{ alignSelf: 'flex-start' }}
                disabled={vm.chosen.length === 0 || vm.isStarting}
                onClick={vm.start}
              >
                {vm.isStarting ? 'Iniciando…' : `Validar y subir tag (${vm.chosen.length})`}
              </button>
            </div>
          )}

          {vm.step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 26, margin: 0 }}>Llevar las versiones al wrapper</h2>
              <p className="muted" style={{ margin: 0 }}>
                Cuando cada versión aparece en Artifactory, actualiza el wrapper desde su estación.
                Rangos que se usarán:
              </p>
              {vm.chosen.map((c) => (
                <div
                  key={c.name}
                  className="kv"
                  style={{ padding: '12px 0', borderBottom: '1px solid var(--via)' }}
                >
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <LineBadge line={c.line} small />
                    {c.shortName}
                  </span>
                  <span className="mono">{c.range}</span>
                </div>
              ))}
              <Link to="/wrapper" className="btn" style={{ alignSelf: 'flex-start' }}>
                Ir al wrapper
              </Link>
            </div>
          )}

          <div className="wizard-nav">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={vm.back}
              disabled={vm.step === 1}
            >
              Estación anterior
            </button>
            <button type="button" className="btn" onClick={vm.next} disabled={!vm.canAdvance}>
              Siguiente estación
            </button>
          </div>
        </section>

        <aside className="split__side">
          <section className="code" aria-labelledby="t-cmd">
            <h2 id="t-cmd">Lo que se va a ejecutar</h2>
            <p className="hint">
              En un clon temporal de cada repo, con el gestor que indique su lockfile.
            </p>
            <pre>{vm.commands}</pre>
          </section>
          <section className="panel">
            <h2>Cómo elegir</h2>
            <p>
              <strong>patch</strong> corrige algo sin cambiar la API.
            </p>
            <p>
              <strong>minor</strong> agrega API sin romper lo existente.
            </p>
            <p>
              <strong>major</strong> rompe la API o sube la versión mínima de React Native.
            </p>
            <p className="muted">
              En versiones 0.x un minor puede romper, por eso el wrapper usa{' '}
              <span className="mono">~</span> en lugar de <span className="mono">^</span>.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

import {
  ErrorBanner,
  LineBadge,
  Notice,
  PageHead,
  Segment,
  Skeleton,
  Station,
} from '../../design-system/components';
import { useWrapperViewModel } from './useWrapperViewModel';

export function WrapperView() {
  const vm = useWrapperViewModel();

  return (
    <main className="page">
      <PageHead
        title="Estación wrapper"
        intro="Aquí se cruzan todas las líneas. El wrapper empaqueta React Native como librería nativa con el patrón brownfield de Callstack y lo entrega a las apps host como AAR y XCFramework."
        actions={
          <button type="button" className="btn" onClick={vm.sync} disabled={!vm.canSync}>
            {vm.isSyncing ? 'Creando rama y PR…' : 'Crear rama y PR'}
          </button>
        }
      />

      {vm.error && <ErrorBanner error={vm.error} />}
      {vm.result && (
        <div className="banner banner--ok" role="status">
          <span>
            Rama <span className="mono">{vm.result.branch}</span> creada.{' '}
            {vm.result.pullRequestUrl ? (
              <a href={vm.result.pullRequestUrl} target="_blank" rel="noreferrer">
                Abrir el PR en Bitbucket
              </a>
            ) : (
              'El PR no devolvió enlace.'
            )}
          </span>
        </div>
      )}

      {vm.info && (
        <dl className="facts">
          <div>
            <dt>Repositorio</dt>
            <dd>{vm.info.repo}</dd>
          </div>
          <div>
            <dt>Gestor</dt>
            <dd>{vm.info.packageManager ?? 'desconocido'}</dd>
          </div>
          <div>
            <dt>React Native</dt>
            <dd>{vm.info.reactNativeVersion ?? '—'}</dd>
          </div>
          <div>
            <dt>Brownfield</dt>
            <dd>{vm.info.brownfieldVersion ?? 'no encontrado'}</dd>
          </div>
        </dl>
      )}

      <div className="split">
        <section className="split__main" aria-labelledby="t-x">
          <h2 id="t-x" style={{ margin: '0 0 6px', fontSize: 22 }}>
            Líneas que llegan al wrapper
          </h2>
          <p className="muted" style={{ margin: '0 0 20px' }}>
            Marca las líneas que entran en este PR. Las que se quedan fuera terminan antes de la
            estación.
          </p>
          {vm.isLoading && <Skeleton rows={6} />}
          <div className="xchange">
            <div className="xchange__grid">
              <div
                className="xchange__row"
                style={{
                  alignItems: 'end',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--gris-senal)',
                }}
              >
                <span />
                <span>Línea</span>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingBottom: 10,
                    paddingRight: 40,
                  }}
                >
                  <span>Hoy en el wrapper</span>
                  <span>Versión destino</span>
                </div>
                <div className="xchange__cap-top">Wrapper</div>
              </div>
              {vm.rows.map((r) => (
                <div key={r.name} className="xchange__row">
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 76,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={r.selected}
                      disabled={!r.selectable}
                      onChange={() => vm.toggle(r.name)}
                      aria-label={`Incluir ${r.shortName}`}
                      style={{ width: 22, height: 22, accentColor: 'var(--tinta)' }}
                    />
                  </label>
                  <div className="xchange__cell">
                    <LineBadge line={r.line} />
                    <div>
                      <strong style={{ display: 'block' }}>{r.shortName}</strong>
                      <span className="muted" style={{ fontSize: 13 }}>
                        {r.meta}
                      </span>
                    </div>
                  </div>
                  <div className="xchange__cell xchange__track">
                    <div className="track">
                      <Station color={r.line.color} on />
                      <Segment color={r.line.color} reached={r.reachesStation} />
                      <Station color={r.line.color} on={r.reachesStation} />
                      {r.reachesStation ? (
                        <span
                          className="segment"
                          style={{ background: r.line.color, flexGrow: 0, width: 56 }}
                        />
                      ) : (
                        <>
                          <span className="segment" style={{ flexGrow: 0, width: 24 }} />
                          <span className="bumper" aria-hidden="true" />
                        </>
                      )}
                    </div>
                    <div className="map__versions" style={{ paddingRight: 56, marginTop: 0 }}>
                      <span className="muted">{r.current}</span>
                      <span style={{ fontWeight: 600 }}>{r.target}</span>
                    </div>
                  </div>
                  <div className="xchange__capsule">
                    <span
                      className="mono"
                      style={{
                        fontWeight: 600,
                        color: r.selected ? 'var(--tinta)' : 'var(--gris-senal)',
                      }}
                    >
                      {r.capsule}
                    </span>
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: r.warn ? 'var(--aviso)' : 'var(--gris-senal)',
                      }}
                    >
                      {r.note}
                    </span>
                  </div>
                </div>
              ))}
              <div className="xchange__row">
                <span />
                <span />
                <span />
                <div className="xchange__cap-bottom" />
              </div>
            </div>
          </div>
        </section>

        <aside className="split__side">
          <section className="panel" aria-labelledby="t-ck">
            <h2 id="t-ck">Revisiones antes del PR</h2>
            <Notice kind="ok">Cada versión destino debe existir en Artifactory.</Notice>
            <Notice kind="ok">
              El rango de React Native de cada librería debe aceptar la versión del wrapper.
            </Notice>
            <Notice kind="stop">Los cambios mayores quedan fuera hasta que los confirmes.</Notice>
            {vm.hasMajors && (
              <label className="notice" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={vm.allowMajor}
                  onChange={(e) => vm.setAllowMajor(e.target.checked)}
                />
                Ya revisé los cambios mayores, inclúyelos
              </label>
            )}
            <Notice kind="off">
              Para Expo más adelante: ninguna librería debe pedir cambios nativos fuera de
              autolinking o de un config plugin.
            </Notice>
          </section>
          <section className="code" aria-labelledby="t-diff">
            <h2 id="t-diff">Cambios en package.json</h2>
            <pre>{vm.diff}</pre>
          </section>
        </aside>
      </div>
    </main>
  );
}

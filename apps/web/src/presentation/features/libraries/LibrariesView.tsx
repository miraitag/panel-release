import { Link } from 'react-router-dom';
import {
  ErrorBanner,
  LineBadge,
  Notice,
  PageHead,
  Segment,
  Skeleton,
  Station,
} from '../../design-system/components';
import { useLibrariesViewModel } from './useLibrariesViewModel';

const SCRIPTS = [
  ['Verificar versiones', 'release:check'],
  ['Generar versión', 'release:bump'],
  ['Validar', 'release:verify'],
  ['Subir tag', 'release:tag'],
  ['Actualizar wrapper', 'pnpm add / npm install'],
] as const;

/** View (MVVM): solo pinta lo que entrega el ViewModel. */
export function LibrariesView() {
  const vm = useLibrariesViewModel();

  return (
    <main className="page">
      <PageHead
        title="Mapa de librerías"
        intro="Cada librería es una línea que pasa por tres estaciones: el repo en Bitbucket, Artifactory y el wrapper. Un tramo punteado indica que esa versión todavía no llega a la siguiente estación."
        actions={
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={vm.refresh}
              disabled={vm.isRefreshing}
            >
              {vm.isRefreshing ? 'Verificando…' : 'Verificar versiones'}
            </button>
            <Link to="/release" className="btn">
              Nuevo release
            </Link>
          </>
        }
      />

      {vm.error && <ErrorBanner error={vm.error} onRetry={vm.retry} />}

      <div className="split">
        <section className="split__main" aria-labelledby="t-map">
          <h2 id="t-map" className="sr-only">
            Líneas por librería
          </h2>
          <div className="map">
            <div className="map__grid">
              <div className="map__head">
                <span>Línea</span>
                <div className="map__head-stations">
                  <span>En el repo</span>
                  <span>En Artifactory</span>
                  <span>En el wrapper</span>
                </div>
                <span style={{ textAlign: 'right' }}>Siguiente paso</span>
              </div>
              {vm.isLoading && <Skeleton rows={6} />}
              {vm.rows.map((r) => (
                <div key={r.name} className="map__row">
                  <div className="map__name">
                    <LineBadge line={r.line} />
                    <div>
                      <strong>{r.shortName}</strong>
                      <span>{r.subtitle}</span>
                    </div>
                  </div>
                  <div>
                    <div className="track">
                      <Station color={r.line.color} on />
                      <Segment color={r.line.color} reached={r.reached.registry} />
                      <Station color={r.line.color} on={r.reached.registry} />
                      <Segment color={r.line.color} reached={r.reached.wrapper} />
                      <Station color={r.line.color} on={r.reached.wrapper} />
                    </div>
                    <div className="map__versions">
                      <span>{r.versions.repo}</span>
                      <span style={{ fontWeight: 600 }}>{r.versions.registry}</span>
                      <span
                        className={r.reached.wrapper ? '' : 'muted'}
                        style={r.reached.wrapper ? undefined : { textDecoration: 'line-through' }}
                      >
                        {r.versions.wrapper}
                      </span>
                    </div>
                  </div>
                  <div className="map__next">
                    <Link to={r.action.to} style={{ fontWeight: 800 }}>
                      {r.action.label}
                    </Link>
                    <span className={`status status--${r.status}`}>{r.statusLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {vm.checkedAtLabel && (
            <p className="muted" style={{ fontSize: 14 }}>
              Última verificación a las {vm.checkedAtLabel}.
            </p>
          )}
        </section>

        <aside className="split__side">
          <section className="panel" aria-labelledby="t-av">
            <h2 id="t-av">Avisos de servicio</h2>
            {vm.notices.map((n) => (
              <Notice key={n.text} kind={n.kind}>
                {n.text}
              </Notice>
            ))}
          </section>
          <section className="panel panel--external" aria-labelledby="t-jk">
            <h2 id="t-jk">Tramo de Jenkins</h2>
            <p className="muted">
              El panel genera la versión y sube el tag. Desde ahí Jenkins publica en Artifactory por
              su cuenta; el panel solo espera a que la versión aparezca.
            </p>
          </section>
          <section className="panel" aria-labelledby="t-sc">
            <h2 id="t-sc">Qué ejecuta cada botón</h2>
            {SCRIPTS.map(([label, script]) => (
              <div key={script} className="kv">
                <span>{label}</span>
                <span className="mono">{script}</span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </main>
  );
}

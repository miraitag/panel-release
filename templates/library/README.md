# Plantilla para cada librería

El Release Panel solo ejecuta `<pm> run <script>`. Para que una librería funcione con el panel:

1. Copia `scripts/` y `.changeset/config.json` al repo.
2. Agrega los scripts de `package.scripts.json` a su `package.json`.
3. Instala `@changesets/cli` y `react-native-builder-bob`.
4. Confirma que el formato del tag (`v{version}`) es el que escucha Jenkins.

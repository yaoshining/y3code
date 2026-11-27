if (
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Select the home before the main runtime loads.
  process.platform === "darwin" &&
  process.versions.electron &&
  require("electron").app.isPackaged
) {
  process.env.T3CODE_HOME =
    process.env.Y3CODE_HOME?.trim() ||
    require("node:path").join(require("node:os").homedir(), ".y3code");
}
require("./compileCache.cjs");
require("./main.cjs");

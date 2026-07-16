import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const packageFile = resolve("ios", "App", "CapApp-SPM", "Package.swift");
const packages = {
  CapacitorApp: "app",
  CapacitorNetwork: "network",
  CapacitorPreferences: "preferences",
  CapacitorSplashScreen: "splash-screen",
  CapacitorStatusBar: "status-bar",
};

let source = readFileSync(packageFile, "utf8");
for (const [name, folder] of Object.entries(packages)) {
  const declaration = new RegExp(
    `(\\.package\\(name: "${name}", path: ")[^"]+("\\))`,
  );
  source = source.replace(
    declaration,
    `$1../../../node_modules/@capacitor/${folder}$2`,
  );
}
writeFileSync(packageFile, source, "utf8");

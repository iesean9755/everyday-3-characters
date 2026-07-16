import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { platform } from "node:process";

const wrapper = platform === "win32" ? "gradlew.bat" : "./gradlew";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const toolRoot = join(projectRoot, "work", "mobile-toolchain");
const env = { ...process.env };

if (platform === "win32") {
  spawnSync("subst", ["R:", toolRoot], { stdio: "ignore", shell: true });
  const jdkFolder = readdirSync(join(toolRoot, "jdk"), {
    withFileTypes: true,
  }).find(
    (entry) =>
      entry.isDirectory() &&
      existsSync(join(toolRoot, "jdk", entry.name, "bin", "java.exe")),
  );
  if (!jdkFolder) throw new Error("未找到项目内的 OpenJDK 21");
  env.JAVA_HOME = join(toolRoot, "jdk", jdkFolder.name);
  env.ANDROID_SDK_ROOT = "R:\\android-sdk2";
  env.PATH = `${env.JAVA_HOME}\\bin;R:\\android-sdk2\\platform-tools;${env.PATH ?? ""}`;
}

const result = spawnSync(wrapper, ["assembleDebug"], {
  cwd: join(projectRoot, "android"),
  env,
  stdio: "inherit",
  shell: platform === "win32",
});
process.exit(result.status ?? 1);

import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("isolates builds sharing an SDK installation while preserving package exports", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "rwsdk-build-paths-")),
  );
  try {
    const sdk = join(root, "shared-rwsdk");
    const constants = join(sdk, "dist/lib/constants.mjs");
    await mkdir(dirname(constants), { recursive: true });
    await copyFile(new URL("./constants.mts", import.meta.url), constants);
    const apps = await Promise.all(
      ["app-a", "app-b"].map(async (name) => {
        const cwd = join(root, name);
        await mkdir(cwd);
        return JSON.parse(
          execFileSync(
            process.execPath,
            [
              "--input-type=module",
              "--eval",
              `import * as paths from ${JSON.stringify(pathToFileURL(constants).href)}; console.log(JSON.stringify(paths));`,
            ],
            { cwd, encoding: "utf8" },
          ),
        );
      }),
    );
    for (const [index, app] of apps.entries()) {
      await mkdir(dirname(app.INTERMEDIATE_SSR_BRIDGE_PATH), {
        recursive: true,
      });
      await writeFile(app.INTERMEDIATE_SSR_BRIDGE_PATH, `app-${index}`);
    }
    // The second build must not overwrite the first app's SSR bundle.
    expect(await readFile(apps[0].INTERMEDIATE_SSR_BRIDGE_PATH, "utf8")).toBe(
      "app-0",
    );
    expect(await readFile(apps[1].INTERMEDIATE_SSR_BRIDGE_PATH, "utf8")).toBe(
      "app-1",
    );
    const pkg = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    );
    for (const app of apps) {
      expect(app.VENDOR_CLIENT_BARREL_PATH).toBe(
        join(sdk, pkg.exports["./__vendor_client_barrel"].default),
      );
      expect(app.VENDOR_SERVER_BARREL_PATH).toBe(
        join(sdk, pkg.exports["./__vendor_server_barrel"].default),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

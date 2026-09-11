import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BuildEnvironment, resolveConfig } from "vite";
import { expect, it } from "vitest";
import { runDirectivesScan } from "./runDirectivesScan.mjs";

it("scans filesystem paths outside the project's top-level directory", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "rwsdk-scan-"));
  const external = await realpath(
    await mkdtemp(fileURLToPath(new URL("./scan-fixture-", import.meta.url))),
  );
  try {
    // On macOS tmpdir uses /var while realpath uses /private; on Linux CI
    // the checkout is under /home and tmpdir is /tmp.
    if (root.split(path.sep)[1] === external.split(path.sep)[1]) {
      context.skip(
        "Requires paths in different top-level filesystem directories",
      );
    }
    await symlink(
      fileURLToPath(new URL("../../node_modules", import.meta.url)),
      path.join(root, "node_modules"),
      "junction",
    );
    await mkdir(path.join(root, "src"));
    const client = path.join(external, "client.js");
    const server = path.join(external, "server.js");
    await writeFile(client, '"use client"; export const client = 1;');
    await writeFile(server, '"use server"; export async function server() {}');
    await writeFile(
      path.join(root, "src/worker.js"),
      `import ${JSON.stringify(client)}; import ${JSON.stringify(server)};`,
    );
    // Preserve the original project path: Vite canonicalizes macOS /var to /private/var.
    const rootConfig = {
      ...(await resolveConfig(
        { root, configFile: false, environments: { worker: {} } },
        "build",
      )),
      root,
    };
    const clientFiles = new Set<string>();
    const serverFiles = new Set<string>();
    await runDirectivesScan({
      rootConfig,
      environments: {
        client: new BuildEnvironment("client", rootConfig),
        worker: new BuildEnvironment("worker", rootConfig),
      },
      clientFiles,
      serverFiles,
      entries: ["src/worker.js"],
      esbuildOptions: {},
    });
    expect([...clientFiles]).toEqual([client]);
    expect([...serverFiles]).toEqual([server]);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
});

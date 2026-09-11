import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  poll,
  setupPlaygroundEnvironment,
  testDevAndDeploy,
  testDeploy,
} from "rwsdk/e2e";
import { expect } from "vitest";

setupPlaygroundEnvironment(import.meta.url);

testDevAndDeploy("renders Hello World", async ({ page, url }) => {
  await page.goto(url);

  const getPageContent = () => page.content();

  await poll(async () => {
    const content = await getPageContent();
    expect(content).toContain("Hello World");
    return true;
  });
});

testDeploy(
  "keeps intermediate SSR output inside the app",
  async ({ projectDir, page, url }) => {
    const bridge = path.join(
      projectDir,
      "node_modules/.cache/rwsdk/__intermediate_builds/ssr/ssr_bridge.js",
    );
    expect((await readFile(bridge, "utf8")).length).toBeGreaterThan(0);
    await page.goto(url);
    expect(await page.content()).toContain("Hello World");
  },
);

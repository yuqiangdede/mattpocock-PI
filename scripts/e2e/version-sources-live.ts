import { net, session } from "electron";
import { createPublicHttpsClient } from "../../apps/desktop/electron/main/public-https-fetch";
import { createVersionSourceChecker } from "../../apps/desktop/electron/main/version-sources";

// 使用 Electron 的实际网络会话验证公开来源，不读取或修改用户数据。
export async function probe() {
  const client = createPublicHttpsClient({
    fetchImpl: (url, init) => net.fetch(url, init),
    routeImpl: (url) => session.defaultSession.resolveProxy(url),
    timeoutMs: 8000,
  });
  const checker = createVersionSourceChecker({
    request: client.request, appVersion: "0.16.0-beta.1", skillVersion: async () => null,
  });
  return Promise.all((await checker.list()).map(async (row) => {
    const result = await checker.check(row.id);
    return { id: result.id, status: result.status, latestVersion: result.latestVersion, error: result.error };
  }));
}

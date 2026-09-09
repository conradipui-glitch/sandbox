import legacyWorker, { HistorySession, ProductAnalytics } from "./index";
import { handleEngineBff, RuntimeRouteSession, type EngineBffEnv } from "./engine-bff";

export { HistorySession, ProductAnalytics, RuntimeRouteSession };

export default {
  async fetch(request: Request, env: EngineBffEnv & Record<string, unknown>): Promise<Response> {
    return handleEngineBff(
      request,
      env,
      (legacyRequest) => legacyWorker.fetch(legacyRequest, env as never),
    );
  },
} satisfies ExportedHandler<EngineBffEnv & Record<string, unknown>>;

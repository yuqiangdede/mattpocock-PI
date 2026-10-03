import { ENGINEERING_CHECK_INTERVAL, type AppSettings, type EngineeringSkillCheck, type EngineeringSkillStatus } from "@pi-desktop/shared";
import type { HostProcess } from "./host-process";

type Owner = Pick<HostProcess, "call" | "generation">;
type UpdateResult = { revision: string; updated: string[]; preserved: string[] };

/** Main owns detection and its timer; Host owns durable preferences and bundle writes. */
export function createEngineeringSkillChecks(options: {
  getHost: () => Owner | null;
  fetchRevision: () => Promise<string>;
  update: () => Promise<UpdateResult>;
  report: (error: unknown) => void;
  now?: () => number;
  schedule?: (tick: () => void) => () => void;
}) {
  const now = options.now ?? Date.now;
  let checking: Promise<EngineeringSkillStatus> | null = null;
  let attempt: { fetched: boolean } | null = null;
  let updating: Promise<UpdateResult> | null = null;
  let cancelTimer: (() => void) | null = null;
  let stopped = false;
  const owner = () => {
    const host = options.getHost();
    if (!host || stopped) throw new Error("host unavailable");
    return host;
  };
  const assertOwner = (host: Owner, generation: Owner["generation"]) => {
    if (stopped || options.getHost() !== host || host.generation !== generation) throw new Error("host changed during skill check");
  };
  const status = async (): Promise<EngineeringSkillStatus> => {
    const host = owner();
    const generation = host.generation;
    const settings = await host.call<AppSettings>("settings.get");
    const bundle = await host.call<{ revision: string }>("skills.ensureBundled");
    assertOwner(host, generation);
    return { attemptedAt: 0, ...settings.engineeringSkillCheck, revision: bundle.revision, checking: checking !== null, updating: updating !== null };
  };
  const check = (automatic = false): Promise<EngineeringSkillStatus> => {
    if (checking) {
      const active = attempt;
      return checking.then(value => !automatic && !active?.fetched ? check() : { ...value, checking: false });
    }
    if (updating) return updating.then(() => status());
    const active = { fetched: false };
    attempt = active;
    checking = (async () => {
      const host = owner();
      const generation = host.generation;
      const settings = await host.call<AppSettings>("settings.get");
      assertOwner(host, generation);
      const previous = settings.engineeringSkillCheck;
      const attemptedAt = now();
      if (automatic && (settings.engineeringSkillUpdateMode === "manual" || (previous && attemptedAt - previous.attemptedAt < ENGINEERING_CHECK_INTERVAL))) return status();
      let state: EngineeringSkillCheck = { ...previous, attemptedAt };
      await host.call("settings.set", { engineeringSkillCheck: state });
      assertOwner(host, generation);
      try {
        active.fetched = true;
        const latestRevision = await options.fetchRevision();
        assertOwner(host, generation);
        state = { ...state, latestRevision, checkedAt: now(), error: undefined };
      } catch (error) {
        assertOwner(host, generation);
        options.report(error);
        state = { ...state, error: "Engineering skill version check failed. Try again manually." };
      }
      await host.call("settings.set", { engineeringSkillCheck: state });
      assertOwner(host, generation);
      return status();
    })().finally(() => { checking = null; attempt = null; });
    return checking.then(value => ({ ...value, checking: false }));
  };
  const update = (): Promise<UpdateResult> => {
    if (updating) return updating;
    updating = (async () => {
      if (checking) await checking;
      const host = owner();
      const generation = host.generation;
      const result = await options.update();
      assertOwner(host, generation);
      await host.call("settings.set", { engineeringSkillCheck: { attemptedAt: now(), checkedAt: now(), latestRevision: result.revision.slice(0, 40), preserved: result.preserved } });
      assertOwner(host, generation);
      return result;
    })().finally(() => { updating = null; });
    return updating;
  };
  const tick = () => {
    if (!stopped && options.getHost()) void check(true).catch(options.report);
  };
  return {
    status, check: (input?: { automatic?: boolean }) => {
      if (input !== undefined && (!input || typeof input !== "object" || Array.isArray(input) || (input.automatic !== undefined && typeof input.automatic !== "boolean"))) return Promise.reject(new Error("Invalid engineering skill check request"));
      return check(input?.automatic === true);
    }, update,
    start() {
      if (cancelTimer || stopped) return;
      cancelTimer = options.schedule ? options.schedule(tick) : (() => { const timer = setInterval(tick, 60000); timer.unref(); return () => clearInterval(timer); })();
      tick();
    },
    stop() { stopped = true; cancelTimer?.(); cancelTimer = null; },
  };
}

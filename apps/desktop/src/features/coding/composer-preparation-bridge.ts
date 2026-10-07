/** A mounted Composer owns preparation; this bridge never submits or caches drafts. */
export type ComposerPreparation = { sessionId: string; projectPath: string; skillId: string; prompt: string };
type Handler = (request: ComposerPreparation) => Promise<boolean>;
let handler: Handler | undefined;
export function registerComposerPreparation(next: Handler): () => void {
  handler = next;
  return () => { if (handler === next) handler = undefined; };
}
export async function prepareComposer(request: ComposerPreparation): Promise<boolean> {
  return handler ? handler(request) : false;
}

function envEnabled(name: string, fallback: boolean = true): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  return fallback;
}

export const ENABLE_ENTITY_DETAIL_ENDPOINT = envEnabled("ENABLE_ENTITY_DETAIL_ENDPOINT", true);
export const ENABLE_CLEANUP_SUGGESTIONS_ENDPOINT = envEnabled("ENABLE_CLEANUP_SUGGESTIONS_ENDPOINT", true);
export const ENABLE_NUCLINO_LINK_EVIDENCE = envEnabled("ENABLE_NUCLINO_LINK_EVIDENCE", true);
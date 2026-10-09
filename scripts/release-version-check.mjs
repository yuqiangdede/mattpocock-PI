export function resolveReleaseDocumentCheck(currentVersion, requestedVersion) {
  const documentVersion = requestedVersion ?? currentVersion.split("-")[0];
  const isPrereleasePreview =
    currentVersion !== documentVersion &&
    currentVersion.startsWith(`${documentVersion}-`);

  return {
    documentVersion,
    surfaceVersion: isPrereleasePreview ? currentVersion : documentVersion,
    isPrereleasePreview,
  };
}

export function isModelsDevProviderCatalog(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.values(value).some(
        (provider) => provider && typeof provider === "object" && provider.models,
      ),
  );
}

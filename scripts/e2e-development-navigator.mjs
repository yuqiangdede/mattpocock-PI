// Reuse the isolated Electron/Host runner; Navigator has its own production journey.
process.argv.push('--navigator');
await import('./e2e-workflow-runs.mjs');

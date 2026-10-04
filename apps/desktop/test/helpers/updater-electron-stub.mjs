export const app = {
  getAppPath: () => process.cwd(),
  getVersion: () => "0.16.0",
  isPackaged: false,
};

export const shell = { openExternal: async () => undefined };
export const net = { fetch: async () => { throw new Error("Network forbidden in updater fixture"); } };

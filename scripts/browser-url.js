function directoryURL(value) {
  const url = new URL(value);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

export const developmentURL = directoryURL(
  process.env.ECHO_DEV_URL || "http://127.0.0.1:5173/",
);
export const productionURL = directoryURL(
  process.env.ECHO_PRODUCTION_URL || "http://127.0.0.1:4173/",
);
export const developmentOrigin = new URL(developmentURL).origin;
export const productionOrigin = new URL(productionURL).origin;

/** True in Vite production builds deployed to Vercel. */
export function isProductionApp(): boolean {
  return import.meta.env.PROD;
}

export function isDemoAuthAllowed(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_ALLOW_DEMO_AUTH === "true";
}

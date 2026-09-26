/** Parse client environment for login_activity audit records */

export type DeviceInfo = {
  device: string;
  browser: string;
  userAgent: string;
};

const detectBrowser = (ua: string): string => {
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome/") && !ua.includes("Edg/")) return "Chrome";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  if (ua.includes("Opera") || ua.includes("OPR/")) return "Opera";
  return "Unknown";
};

const detectDevice = (ua: string): string => {
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Desktop";
};

export const getDeviceInfo = (): DeviceInfo => {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return {
    device: detectDevice(userAgent),
    browser: detectBrowser(userAgent),
    userAgent,
  };
};

export type GeoHint = { ipAddress: string; location: string };

/** Best-effort IP/location, non-blocking, fails silently */
export const fetchGeoHint = async (): Promise<GeoHint> => {
  try {
    const ipRes = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(3000) });
    const { ip } = await ipRes.json() as { ip: string };
    try {
      const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(3000) });
      const geo = await geoRes.json() as { city?: string; country_name?: string };
      const location = [geo.city, geo.country_name].filter(Boolean).join(", ") || "Unknown";
      return { ipAddress: ip, location };
    } catch {
      return { ipAddress: ip, location: "Unknown" };
    }
  } catch {
    return { ipAddress: "Unknown", location: "Unknown" };
  }
};

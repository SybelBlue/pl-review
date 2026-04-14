export function resolvePrairieLearnUrl(value, baseUrl) {
  const trimmed = String(value || "").trim();
  const safeBaseUrl = baseUrl || "http://127.0.0.1:3000";

  if (!trimmed) {
    return safeBaseUrl;
  }

  try {
    return new URL(trimmed).toString();
  } catch (error) {
    return new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, safeBaseUrl).toString();
  }
}

export function getRelativePrairieLearnPath(url, baseUrl) {
  if (!url) {
    return "";
  }

  try {
    const absolute = new URL(url);
    const base = new URL(baseUrl || "http://127.0.0.1:3000");
    if (absolute.origin === base.origin) {
      return `${absolute.pathname}${absolute.search}${absolute.hash}`;
    }
  } catch (error) {
    return url;
  }

  return url;
}

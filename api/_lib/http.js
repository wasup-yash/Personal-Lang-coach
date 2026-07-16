export function json(response, status, body) {
  response.status(status).json(body);
}

export function requireMethod(request, response, method) {
  if (request.method === method) return true;
  response.setHeader("Allow", method);
  json(response, 405, { error: "Method not allowed." });
  return false;
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf("=");
      return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
    })
  );
}

export function serializeCookie(name, value, { maxAge = 60 * 60, httpOnly = true } = {}) {
  const secure = process.env.NODE_ENV === "production" || process.env.VERCEL ? "; Secure" : "";
  const httpOnlyFlag = httpOnly ? "; HttpOnly" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}${httpOnlyFlag}`;
}

export function noStore(response) {
  response.setHeader("Cache-Control", "no-store");
}

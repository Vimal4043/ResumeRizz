import { isIP } from "node:net";

/**
 * Spoof-resistant client-IP resolution.
 *
 * Threat model this addresses: when `trust proxy` is enabled, a directly-
 * exposed API will trust a client-supplied `X-Forwarded-For`, letting a client
 * forge their IP and bypass any IP-based backstop (e.g. request rate limiting).
 *
 * Rule:
 *   - The TCP socket peer (`socket.remoteAddress`) is the only address the
 *     server can be certain about. It is NEVER client-controlled.
 *   - X-Forwarded-For is honored ONLY when the socket peer is private/
 *     loopback — i.e. there is genuinely a trusted proxy hop in front. In that
 *     case the real client is the RIGHT-MOST XFF entry (the one the proxy
 *     appended). When the socket peer is public there is no trusted proxy, so
 *     XFF is ignored entirely and the socket address is returned.
 *
 * Behind Render's single hop (loopback/private router) XFF gives the real
 * client; a direct connection is spoof-proof.
 *
 * @param {import('express').Request} req
 * @returns {string} a single IP address (IPv4 or IPv6, v4-mapped normalized to IPv4)
 */
export function getClientIp(req) {
  const socketIp =
    req?.socket?.remoteAddress || req?.connection?.remoteAddress || "";
  if (!isPrivateIp(socketIp)) {
    // Direct connection (or a proxy that is itself publicly addressed): only
    // the socket address is trustworthy. Ignore any client-sent XFF.
    return normalizeIp(socketIp);
  }
  // Behind a trusted (private) proxy: the real client is the rightmost XFF.
  const xff =
    (req?.headers?.["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (let i = xff.length - 1; i >= 0; i--) {
    const candidate = xff[i];
    if (isIP(candidate)) return normalizeIp(candidate);
  }
  return normalizeIp(socketIp);
}

/** Whether an address is loopback/private so we may trust an XFF hop. */
function isPrivateIp(ip) {
  if (!ip) return false;
  if (ip === "::1") return true;
  if (ip === "::") return true;
  if (ip.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 (::ffff:1.2.3.4)
    return isPrivateIp(ip.slice(7));
  }
  if (isIP(ip) === 6) {
    // Unique-local or link-local IPv6.
    if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
    return false;
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const [a, b] = parts.map(Number);
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 169 && b === 254) return true; // link-local 169.254/16
  return false;
}

/** Strip IPv6 wrapper / v4-mapping so keys stay stable. */
function normalizeIp(ip) {
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

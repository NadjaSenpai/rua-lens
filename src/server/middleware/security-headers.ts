import { secureHeaders } from "hono/secure-headers";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src-elem 'self'",
  "style-src-attr 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

export const securityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrcElem: ["'self'"],
    styleSrcAttr: ["'unsafe-inline'"],
    connectSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'none'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
  },
  referrerPolicy: "no-referrer",
  xContentTypeOptions: "nosniff",
  xFrameOptions: "DENY",
  xXssProtection: false,
});

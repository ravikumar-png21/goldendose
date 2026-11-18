// Browser safety headers. Each one is an instruction to the browser that limits the damage
// if something else ever goes wrong. They are sent with every reply (see app.js).

// The content security policy: where this site's pages may load things from.
// The important line is script-src 'self': the browser will only run script files from our own site,
// so text typed by a person can never run as code, even if a screen forgot to clean it.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // a few screens set a width or colour inline; the font's stylesheet
  "font-src 'self' https://fonts.gstatic.com",                      // the font files themselves
  "img-src 'self' blob: data:",                                     // our photos, a just-chosen photo, small inline pictures
  "connect-src 'self'",                                             // the apps talk only to this backend
  "frame-src 'self' blob:",                                         // a prescription PDF opened from the app
  "object-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",                                         // no other site may show GoldenDose inside a frame
].join("; ");

export function securityHeaders(req, res, next) {
  res.set({
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "X-Content-Type-Options": "nosniff",   // never guess a file's type: use the type we send
    "X-Frame-Options": "DENY",             // the older way of saying frame-ancestors 'none'
    "Referrer-Policy": "no-referrer",      // links to other sites don't reveal our page addresses
    "Permissions-Policy": "geolocation=(self), camera=(self), microphone=()", // location for the emergency button, camera for photos
  });
  // Over HTTPS, tell the browser to always use HTTPS for this site from now on (one year).
  if (req.secure) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

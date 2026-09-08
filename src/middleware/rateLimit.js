import rateLimit from 'express-rate-limit';

// Shared per-endpoint limiters. Vercel's serverless functions each keep
// their own in-memory counters (no shared store like Redis), so this
// protects against a burst hitting one warm instance rather than a
// perfectly enforced global limit across every cold start - still a real
// improvement over the previous no-limit-at-all state, and the right size
// of fix without standing up new infrastructure.

export const contactFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many submissions from this address. Please try again later or call us directly.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const calculatorQuoteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10, // a visitor may reasonably re-run the calculator a few times before saving
  message: { error: 'Too many submissions from this address. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failed attempts against the limit
});

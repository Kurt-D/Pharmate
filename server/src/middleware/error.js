export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

// Express 5 catches async errors automatically; this handles sync throws and
// explicit next(err) calls. The unused _next arg is required for Express to
// recognize this as an error handler (4-arity).
export function globalError(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' && status === 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
}

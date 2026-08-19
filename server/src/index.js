import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createUploadsDir } from './db/connection.js';
import { startScheduler } from './jobs/scheduler.js';

import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import patientRouter from './routes/patient.js';
import caregiverRouter from './routes/caregiver.js';
import pharmacistRouter from './routes/pharmacist.js';
import adminRouter from './routes/admin.js';
import surveysRouter from './routes/surveys.js';
import directoryRouter from './routes/directory.js';
import { trustedOrigins, validateEnvironment } from './config/environment.js';

validateEnvironment();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
const allowedOrigins = trustedOrigins();
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      const error = new Error('Origin not allowed');
      error.status = 403;
      return callback(error);
    },
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '32kb' }));

app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/patient', patientRouter);
app.use('/api/caregiver', caregiverRouter);
app.use('/api/pharmacist', pharmacistRouter);
app.use('/api/admin', adminRouter);
app.use('/api/surveys', surveysRouter);
app.use('/api/directory', directoryRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler (Express 5 catches async throws automatically).
// The unused _next arg is required for Express to treat this as an error handler.
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = status >= 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
});

// Don't bind a port under test — suites import `app` and supertest spins up its
// own ephemeral server; listening here would double-bind the port (EADDRINUSE).
if (process.env.NODE_ENV !== 'test') {
  createUploadsDir();
  app.listen(PORT, () => {
    console.log(`PharMate server listening on http://localhost:${PORT}`);
  });
  startScheduler(); // reminder + missed-sweep + photo-purge cron pipeline
}

export default app;

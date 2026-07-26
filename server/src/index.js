import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createUploadsDir } from './db/connection.js';

import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import patientRouter from './routes/patient.js';
import caregiverRouter from './routes/caregiver.js';
import pharmacistRouter from './routes/pharmacist.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());

app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/patient', patientRouter);
app.use('/api/caregiver', caregiverRouter);
app.use('/api/pharmacist', pharmacistRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler (Express 5 catches async throws automatically).
// The unused _next arg is required for Express to treat this as an error handler.
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' && status === 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
});

createUploadsDir();

app.listen(PORT, () => {
  console.log(`PharMate server listening on http://localhost:${PORT}`);
});

export default app;

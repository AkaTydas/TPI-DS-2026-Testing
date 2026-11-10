import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { ReservationController } from './controllers/reservationController.js';
import { SagaController } from './controllers/sagaController.js';
import { WebhookController } from './controllers/webhookController.js';
import { InspectorController } from './controllers/inspectorController.js';

export const app = express();

app.use(cors());
app.use(express.json());

// Middleware de Trazabilidad Distribuida: X-Request-Id
app.use((req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers['x-request-id'] as string) || `req-${randomUUID().substring(0, 8)}`;
  req.headers['x-request-id'] = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
});

// Endpoint de Healthcheck
app.get('/health', (req: Request, res: Response) => {
  res.json({
    estado: 'UP',
    modulo: 'M9 - Reservas de Viajes (Demo Sagas & Database per Service)',
    grupo: 8,
    timestamp: new Date().toISOString()
  });
});

// Rutas de Reservas en M9 (Persistencia aislada en db_m9)
app.post('/reservas', ReservationController.crear);
app.get('/reservas', ReservationController.listar);
app.get('/reservas/:id', ReservationController.obtenerPorId);
app.get('/reservas/:id/historial', ReservationController.obtenerHistorial);

// Ruta Principal de la SAGA: Activación y Despacho
app.post('/reservas/:id/activar-saga', SagaController.activarSaga);

// Ruta de Webhook Callback (RF-9.10)
app.post('/webhooks/despacho', WebhookController.procesarDespacho);

// Ruta de Auditoría de Bases de Datos Aisladas
app.get('/inspeccionar-bases', InspectorController.inspeccionar);

import { Request, Response } from 'express';
import { ActivationSagaOrchestrator } from '../saga/activationSagaOrchestrator.js';
import { randomUUID } from 'node:crypto';

export class SagaController {
  public static async activarSaga(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        forzarFalloM5,
        desactivarCandadoIdempotencia,
        desactivarCompensacionDefensiva,
        desactivarControlOptimista
      } = req.body;
      const requestId = (req.headers['x-request-id'] as string) || `req-${randomUUID().substring(0, 8)}`;
      const idempotencyKey = (req.headers['idempotency-key'] as string) || `idem-${id}-${Date.now()}`;

      // Invocación al Orquestador con soporte de switches didácticos para coloquio
      const resultado = await ActivationSagaOrchestrator.ejecutarSaga(id, {
        forzarFalloM5: Boolean(forzarFalloM5),
        idempotencyKey,
        requestId,
        desactivarCandadoIdempotencia: Boolean(desactivarCandadoIdempotencia),
        desactivarCompensacionDefensiva: Boolean(desactivarCompensacionDefensiva),
        desactivarControlOptimista: Boolean(desactivarControlOptimista)
      });

      res.setHeader('X-Request-Id', requestId);
      res.setHeader('Idempotency-Key', idempotencyKey);
      res.status(resultado.exito ? 200 : 200).json(resultado);
    } catch (error: unknown) {
      const err = error as { status?: number; title?: string; message?: string };
      res.status(err.status || 500).json({
        error: err.title || 'Error en ejecución de Saga',
        detalle: err.message
      });
    }
  }
}

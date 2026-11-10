import { ActivationSagaOrchestrator } from '../saga/activationSagaOrchestrator.js';
import { randomUUID } from 'node:crypto';
export class SagaController {
    static async activarSaga(req, res) {
        try {
            const { id } = req.params;
            const { forzarFalloM5 } = req.body;
            const requestId = req.headers['x-request-id'] || `req-${randomUUID().substring(0, 8)}`;
            const idempotencyKey = req.headers['idempotency-key'] || `idem-${id}-${Date.now()}`;
            // Invocación al Orquestador
            const resultado = await ActivationSagaOrchestrator.ejecutarSaga(id, {
                forzarFalloM5: Boolean(forzarFalloM5),
                idempotencyKey,
                requestId
            });
            res.setHeader('X-Request-Id', requestId);
            res.setHeader('Idempotency-Key', idempotencyKey);
            res.status(resultado.exito ? 200 : 200).json(resultado);
        }
        catch (error) {
            const err = error;
            res.status(err.status || 500).json({
                error: err.title || 'Error en ejecución de Saga',
                detalle: err.message
            });
        }
    }
}

import { ReservationRepository } from '../repositories/reservationRepository.js';
import { HistoryRepository } from '../repositories/historyRepository.js';
import { Logger } from '../utils/logger.js';
export class WebhookController {
    /**
     * RF-9.10: Callback idempotente de M5 informando resultado de despacho.
     */
    static async procesarDespacho(req, res) {
        const { reservaId, resultado, conductorId, conductorNombre } = req.body;
        const requestId = req.headers['x-request-id'] || 'req-webhook';
        const reserva = ReservationRepository.obtenerPorId(reservaId);
        if (!reserva) {
            res.status(404).json({ error: `Reserva ${reservaId} no existe.` });
            return;
        }
        // Regla de idempotencia estricta: si ya fue procesado, responder HTTP 200 sin efectos colaterales
        if ((resultado === 'CONFIRMADA' && reserva.estado === 'ACTIVADA') ||
            (resultado === 'VENCIDA' && reserva.estado === 'VENCIDA')) {
            Logger.warn(`[WEBHOOK IDEMPOTENTE] Aviso ya procesado para reserva ${reservaId}. Retornando HTTP 200 sin duplicar historial.`, requestId);
            res.status(200).json({
                mensaje: 'Aviso ya procesado previamente (Idempotente).',
                reservaId,
                estadoActual: reserva.estado
            });
            return;
        }
        if (resultado === 'CONFIRMADA') {
            ReservationRepository.actualizarEstado(reservaId, 'ACTIVADA', { conductorId });
            HistoryRepository.registrar({
                reservaId,
                tipoEvento: 'RESERVA_ACTIVADA',
                estadoAnterior: reserva.estado,
                estadoNuevo: 'ACTIVADA',
                actor: 'M5_DESPACHO_WEBHOOK',
                detalles: { conductorId, conductorNombre },
                fechaHora: new Date().toISOString()
            });
            res.json({ mensaje: 'Reserva activada mediante webhook.', reservaId, estado: 'ACTIVADA' });
        }
        else {
            ReservationRepository.actualizarEstado(reservaId, 'VENCIDA');
            HistoryRepository.registrar({
                reservaId,
                tipoEvento: 'RESERVA_VENCIDA',
                estadoAnterior: reserva.estado,
                estadoNuevo: 'VENCIDA',
                actor: 'M5_DESPACHO_WEBHOOK',
                detalles: { motivo: 'Fallo reportado por webhook' },
                fechaHora: new Date().toISOString()
            });
            res.json({ mensaje: 'Reserva marcada como vencida.', reservaId, estado: 'VENCIDA' });
        }
    }
}

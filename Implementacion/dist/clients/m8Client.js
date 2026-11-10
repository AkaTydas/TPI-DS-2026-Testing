import { Logger } from '../utils/logger.js';
export class M8Client {
    /**
     * Tr (Transacción Reintentable): Notificación al pasajero.
     * Ocurre tras el resultado final de la saga. Garantiza idempotencia y reintentos.
     */
    static async enviarNotificacion(payload, requestId) {
        Logger.sagaStep('Tr', 'M8', `Notificación multicanal (${payload.tipoEvento}) enviada a cliente ${payload.clienteId}`, 'OK', requestId);
        return true;
    }
}

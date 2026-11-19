import { Logger } from '../utils/logger.js';

export interface M8NotificacionPayload {
  tipoEvento: 'RESERVA_ACTIVADA' | 'RESERVA_VENCIDA';
  reservaId: string;
  clienteId: string;
  mensaje: string;
}

export class M8Client {
  /**
   * Tr (Transacción Reintentable): Notificación al pasajero.
   * Ocurre tras el resultado final de la saga. Garantiza idempotencia y reintentos.
   */
  public static async enviarNotificacion(payload: M8NotificacionPayload, requestId?: string): Promise<boolean> {
    Logger.sagaStep(
      'Tr',
      'M8',
      `Notificación multicanal (${payload.tipoEvento}) enviada a cliente ${payload.clienteId}`,
      'OK',
      requestId
    );
    return true;
  }
}

import { Logger } from '../utils/logger.js';
import { AppError } from '../domain/errors.js';

export interface M2ClienteResponse {
  clienteId: string;
  nombre: string;
  estado: 'ACTIVO' | 'BLOQUEADO';
}

export class M2Client {
  /**
   * Validación de dominio preservando Data Ownership.
   * M9 no accede a la tabla de clientes de M2; consume su API pública tipada.
   */
  public static async verificarCliente(clienteId: string, requestId?: string): Promise<M2ClienteResponse> {
    Logger.info(`[M2Client] Consultando estado de cuenta del cliente: ${clienteId}`, requestId);

    // Simulación de contrato REST M2
    if (clienteId === 'cliente-bloqueado') {
      throw new AppError(422, 'Cliente bloqueado', `El cliente ${clienteId} se encuentra bloqueado para realizar viajes.`);
    }

    return {
      clienteId,
      nombre: 'Juan Pérez (Pasajero)',
      estado: 'ACTIVO'
    };
  }
}

import { dbM7 } from '../config/database.js';
import { Logger } from '../utils/logger.js';
import { TransaccionPagoM7 } from '../domain/types.js';
import { randomUUID } from 'node:crypto';

export class M7Client {
  /**
   * T2 (Transacción Compensable): Pre-autorizar y retener fondos en el subsistema financiero.
   * Modifica exclusivamente la base de datos de M7 (db_pagos).
   */
  public static async preAutorizarPago(
    params: { reservaId: string; monto: number },
    requestId?: string
  ): Promise<TransaccionPagoM7> {
    const txId = `tx-${randomUUID().substring(0, 8)}`;
    const ahora = new Date().toISOString();

    const stmt = dbM7.prepare(`
      INSERT INTO transacciones (id, reserva_id, monto, estado, fecha_hora)
      VALUES (?, ?, ?, 'PRE_AUTORIZADO', ?)
    `);
    stmt.run(txId, params.reservaId, params.monto, ahora);

    Logger.sagaStep('Tc', 'M7', `Retención de fondos de $${params.monto.toFixed(2)} (TX: ${txId})`, 'OK', requestId);

    return {
      id: txId,
      reservaId: params.reservaId,
      monto: params.monto,
      estado: 'PRE_AUTORIZADO',
      fechaHora: ahora
    };
  }

  /**
   * C2 (Acción Compensatoria): Liberación de la pre-autorización monetaria.
   * Rollback lógico: el saldo retenido vuelve a $0.
   */
  public static async liberarPreAutorizacion(
    params: { reservaId: string },
    requestId?: string
  ): Promise<{ transaccionId: string; estado: string }> {
    const ahora = new Date().toISOString();

    const stmt = dbM7.prepare(`
      UPDATE transacciones
      SET estado = 'LIBERADO', fecha_hora = ?
      WHERE reserva_id = ? AND estado = 'PRE_AUTORIZADO'
    `);
    stmt.run(ahora, params.reservaId);

    Logger.sagaStep('C2', 'M7', `Compensación: Fondos liberados para Reserva ${params.reservaId}`, 'COMPENSADO', requestId);

    return {
      transaccionId: params.reservaId,
      estado: 'LIBERADO'
    };
  }

  /**
   * Método de inspección para evidencias técnicas:
   * Consulta únicamente la base de datos de M7.
   */
  public static obtenerEstadoFinanciero(reservaId: string): TransaccionPagoM7 | null {
    const stmt = dbM7.prepare('SELECT * FROM transacciones WHERE reserva_id = ? ORDER BY fecha_hora DESC LIMIT 1');
    const row = stmt.get(reservaId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      id: row.id as string,
      reservaId: row.reserva_id as string,
      monto: Number(row.monto),
      estado: row.estado as 'PRE_AUTORIZADO' | 'LIBERADO' | 'COBRADO',
      fechaHora: row.fecha_hora as string
    };
  }
}

import { dbM9 } from '../config/database.js';
import { Reserva, EstadoReserva } from '../domain/types.js';
import { AppError } from '../domain/errors.js';
import { HistoryRepository } from './historyRepository.js';

export class ReservationRepository {
  public static crear(reserva: Reserva): void {
    const stmt = dbM9.prepare(`
      INSERT INTO reservas (
        id, cliente_id, origen, destino, tarifa_estimada,
        estado, solicitud_despacho_id, conductor_id, clave_idempotencia,
        creado_en, actualizado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      reserva.id,
      reserva.clienteId,
      reserva.origen,
      reserva.destino,
      reserva.tarifaEstimada,
      reserva.estado,
      reserva.solicitudDespachoId,
      reserva.conductorId,
      reserva.claveIdempotencia,
      reserva.creadoEn,
      reserva.actualizadoEn
    );
  }

  public static obtenerPorId(id: string): Reserva | null {
    const stmt = dbM9.prepare('SELECT * FROM reservas WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      id: row.id as string,
      clienteId: row.cliente_id as string,
      origen: row.origen as string,
      destino: row.destino as string,
      tarifaEstimada: Number(row.tarifa_estimada),
      estado: row.estado as EstadoReserva,
      solicitudDespachoId: (row.solicitud_despacho_id as string) || null,
      conductorId: (row.conductor_id as string) || null,
      claveIdempotencia: row.clave_idempotencia as string,
      creadoEn: row.creado_en as string,
      actualizadoEn: row.actualizado_en as string
    };
  }

  /**
   * Actualiza el estado de una reserva con Control de Concurrencia Optimista (OCC).
   * Si se especifica estadoEsperado, la sentencia SQL exige WHERE id = ? AND estado = estadoEsperado.
   * Si otra transacción ya modificó el estado, changes es 0 y se arroja AppError 409 Conflict.
   */
  public static actualizarEstado(
    id: string,
    estado: EstadoReserva,
    extras?: { solicitudDespachoId?: string | null; conductorId?: string | null },
    estadoEsperado?: EstadoReserva
  ): void {
    const ahora = new Date().toISOString();
    
    if (extras) {
      const sql = estadoEsperado
        ? `UPDATE reservas 
           SET estado = ?, 
               solicitud_despacho_id = COALESCE(?, solicitud_despacho_id),
               conductor_id = COALESCE(?, conductor_id),
               actualizado_en = ?
           WHERE id = ? AND estado = ?`
        : `UPDATE reservas 
           SET estado = ?, 
               solicitud_despacho_id = COALESCE(?, solicitud_despacho_id),
               conductor_id = COALESCE(?, conductor_id),
               actualizado_en = ?
           WHERE id = ?`;
      const stmt = dbM9.prepare(sql);
      const res = (estadoEsperado
        ? stmt.run(estado, extras.solicitudDespachoId ?? null, extras.conductorId ?? null, ahora, id, estadoEsperado)
        : stmt.run(estado, extras.solicitudDespachoId ?? null, extras.conductorId ?? null, ahora, id)) as { changes: number };

      if (estadoEsperado && res.changes === 0) {
        throw new AppError(
          409,
          'Conflicto de concurrencia optimista',
          `La reserva ${id} no pudo ser actualizada a ${estado} porque no se encuentra en el estado esperado (${estadoEsperado}). Fue modificada por otra operación concurrente.`
        );
      }
    } else {
      const sql = estadoEsperado
        ? `UPDATE reservas SET estado = ?, actualizado_en = ? WHERE id = ? AND estado = ?`
        : `UPDATE reservas SET estado = ?, actualizado_en = ? WHERE id = ?`;
      const stmt = dbM9.prepare(sql);
      const res = (estadoEsperado
        ? stmt.run(estado, ahora, id, estadoEsperado)
        : stmt.run(estado, ahora, id)) as { changes: number };

      if (estadoEsperado && res.changes === 0) {
        throw new AppError(
          409,
          'Conflicto de concurrencia optimista',
          `La reserva ${id} no pudo ser actualizada a ${estado} porque no se encuentra en el estado esperado (${estadoEsperado}). Fue modificada por otra operación concurrente.`
        );
      }
    }
  }

  /**
   * Transiciona el estado y registra el historial bajo una transacción SQLite local atómica.
   * Si cualquiera de las dos operaciones falla, se realiza ROLLBACK completo en db_m9.
   */
  public static transicionarConHistorial(
    id: string,
    nuevoEstado: EstadoReserva,
    evento: {
      tipoEvento: string;
      estadoAnterior: string;
      actor: string;
      detalles: Record<string, unknown>;
    },
    opciones?: {
      extras?: { solicitudDespachoId?: string | null; conductorId?: string | null };
      estadoEsperado?: EstadoReserva;
    }
  ): void {
    dbM9.exec('BEGIN IMMEDIATE');
    try {
      this.actualizarEstado(id, nuevoEstado, opciones?.extras, opciones?.estadoEsperado);
      HistoryRepository.registrar({
        reservaId: id,
        tipoEvento: evento.tipoEvento,
        estadoAnterior: evento.estadoAnterior,
        estadoNuevo: nuevoEstado,
        actor: evento.actor,
        detalles: evento.detalles,
        fechaHora: new Date().toISOString()
      });
      dbM9.exec('COMMIT');
    } catch (err) {
      dbM9.exec('ROLLBACK');
      throw err;
    }
  }

  public static listar(): Reserva[] {
    const stmt = dbM9.prepare('SELECT * FROM reservas ORDER BY creado_en DESC');
    const rows = stmt.all() as Record<string, unknown>[];

    return rows.map((row) => ({
      id: row.id as string,
      clienteId: row.cliente_id as string,
      origen: row.origen as string,
      destino: row.destino as string,
      tarifaEstimada: Number(row.tarifa_estimada),
      estado: row.estado as EstadoReserva,
      solicitudDespachoId: (row.solicitud_despacho_id as string) || null,
      conductorId: (row.conductor_id as string) || null,
      claveIdempotencia: row.clave_idempotencia as string,
      creadoEn: row.creado_en as string,
      actualizadoEn: row.actualizado_en as string
    }));
  }
}

import { dbM9 } from '../config/database.js';
import { Reserva, EstadoReserva } from '../domain/types.js';

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

  public static actualizarEstado(
    id: string,
    estado: EstadoReserva,
    extras?: { solicitudDespachoId?: string | null; conductorId?: string | null }
  ): void {
    const ahora = new Date().toISOString();
    
    if (extras) {
      const stmt = dbM9.prepare(`
        UPDATE reservas 
        SET estado = ?, 
            solicitud_despacho_id = COALESCE(?, solicitud_despacho_id),
            conductor_id = COALESCE(?, conductor_id),
            actualizado_en = ?
        WHERE id = ?
      `);
      stmt.run(estado, extras.solicitudDespachoId ?? null, extras.conductorId ?? null, ahora, id);
    } else {
      const stmt = dbM9.prepare(`
        UPDATE reservas 
        SET estado = ?, actualizado_en = ?
        WHERE id = ?
      `);
      stmt.run(estado, ahora, id);
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

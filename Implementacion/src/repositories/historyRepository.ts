import { dbM9 } from '../config/database.js';
import { HistorialEvento } from '../domain/types.js';

export class HistoryRepository {
  public static registrar(evento: HistorialEvento): void {
    const stmt = dbM9.prepare(`
      INSERT INTO historial_reservas (
        reserva_id, tipo_evento, estado_anterior, estado_nuevo,
        actor, detalles, fecha_hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      evento.reservaId,
      evento.tipoEvento,
      evento.estadoAnterior,
      evento.estadoNuevo,
      evento.actor,
      JSON.stringify(evento.detalles || {}),
      evento.fechaHora || new Date().toISOString()
    );
  }

  public static obtenerPorReserva(reservaId: string): HistorialEvento[] {
    const stmt = dbM9.prepare(`
      SELECT * FROM historial_reservas
      WHERE reserva_id = ?
      ORDER BY id ASC
    `);
    const rows = stmt.all(reservaId) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: row.id as number,
      reservaId: row.reserva_id as string,
      tipoEvento: row.tipo_evento as string,
      estadoAnterior: (row.estado_anterior as string) || '',
      estadoNuevo: (row.estado_nuevo as string) || '',
      actor: row.actor as string,
      detalles: JSON.parse((row.detalles as string) || '{}'),
      fechaHora: row.fecha_hora as string
    }));
  }
}

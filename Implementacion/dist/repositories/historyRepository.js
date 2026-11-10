import { dbM9 } from '../config/database.js';
export class HistoryRepository {
    static registrar(evento) {
        const stmt = dbM9.prepare(`
      INSERT INTO historial_reservas (
        reserva_id, tipo_evento, estado_anterior, estado_nuevo,
        actor, detalles, fecha_hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(evento.reservaId, evento.tipoEvento, evento.estadoAnterior, evento.estadoNuevo, evento.actor, JSON.stringify(evento.detalles || {}), evento.fechaHora || new Date().toISOString());
    }
    static obtenerPorReserva(reservaId) {
        const stmt = dbM9.prepare(`
      SELECT * FROM historial_reservas
      WHERE reserva_id = ?
      ORDER BY id ASC
    `);
        const rows = stmt.all(reservaId);
        return rows.map((row) => ({
            id: row.id,
            reservaId: row.reserva_id,
            tipoEvento: row.tipo_evento,
            estadoAnterior: row.estado_anterior || '',
            estadoNuevo: row.estado_nuevo || '',
            actor: row.actor,
            detalles: JSON.parse(row.detalles || '{}'),
            fechaHora: row.fecha_hora
        }));
    }
}

import { dbM9 } from '../config/database.js';
export class ReservationRepository {
    static crear(reserva) {
        const stmt = dbM9.prepare(`
      INSERT INTO reservas (
        id, cliente_id, origen, destino, tarifa_estimada,
        estado, solicitud_despacho_id, conductor_id, clave_idempotencia,
        creado_en, actualizado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(reserva.id, reserva.clienteId, reserva.origen, reserva.destino, reserva.tarifaEstimada, reserva.estado, reserva.solicitudDespachoId, reserva.conductorId, reserva.claveIdempotencia, reserva.creadoEn, reserva.actualizadoEn);
    }
    static obtenerPorId(id) {
        const stmt = dbM9.prepare('SELECT * FROM reservas WHERE id = ?');
        const row = stmt.get(id);
        if (!row)
            return null;
        return {
            id: row.id,
            clienteId: row.cliente_id,
            origen: row.origen,
            destino: row.destino,
            tarifaEstimada: Number(row.tarifa_estimada),
            estado: row.estado,
            solicitudDespachoId: row.solicitud_despacho_id || null,
            conductorId: row.conductor_id || null,
            claveIdempotencia: row.clave_idempotencia,
            creadoEn: row.creado_en,
            actualizadoEn: row.actualizado_en
        };
    }
    static actualizarEstado(id, estado, extras) {
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
        }
        else {
            const stmt = dbM9.prepare(`
        UPDATE reservas 
        SET estado = ?, actualizado_en = ?
        WHERE id = ?
      `);
            stmt.run(estado, ahora, id);
        }
    }
    static listar() {
        const stmt = dbM9.prepare('SELECT * FROM reservas ORDER BY creado_en DESC');
        const rows = stmt.all();
        return rows.map((row) => ({
            id: row.id,
            clienteId: row.cliente_id,
            origen: row.origen,
            destino: row.destino,
            tarifaEstimada: Number(row.tarifa_estimada),
            estado: row.estado,
            solicitudDespachoId: row.solicitud_despacho_id || null,
            conductorId: row.conductor_id || null,
            claveIdempotencia: row.clave_idempotencia,
            creadoEn: row.creado_en,
            actualizadoEn: row.actualizado_en
        }));
    }
}

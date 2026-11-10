import { dbM5 } from '../config/database.js';
import { Logger } from '../utils/logger.js';
import { NoDriversAvailableError } from '../domain/errors.js';
import { randomUUID } from 'node:crypto';
export class M5Client {
    /**
     * T3 (Transacción Pivotante): Solicitud de Despacho y Asignación de Chofer en M5.
     * Modifica exclusivamente la base de datos de M5 (db_despacho).
     */
    static async solicitarDespacho(params, idempotencyKey, requestId) {
        const solicitudId = `desp-${randomUUID().substring(0, 8)}`;
        const ahora = new Date().toISOString();
        Logger.info(`[M5Client] Procesando despacho con Idempotency-Key: ${idempotencyKey.substring(0, 8)}...`, requestId);
        // ESCENARIO DE FALLO FORZADO (O cuando no hay conductores en el radio)
        if (params.forzarFallo) {
            const stmtFallo = dbM5.prepare(`
        INSERT INTO solicitudes_despacho (id, reserva_id, conductor_id, conductor_nombre, vehiculo, estado, fecha_hora)
        VALUES (?, ?, NULL, NULL, NULL, 'SIN_CONDUCTOR', ?)
      `);
            stmtFallo.run(solicitudId, params.reservaId, ahora);
            Logger.sagaStep('Tp', 'M5', 'Búsqueda de conductor cercano en radio operativo', 'FALLO', requestId);
            throw new NoDriversAvailableError('M5: No se encontraron conductores disponibles en la zona en el tiempo límite.');
        }
        // ESCENARIO EXITOSO: Asignación de conductor disponible
        const conductorStmt = dbM5.prepare('SELECT * FROM conductores WHERE disponible = 1 LIMIT 1');
        const chofer = conductorStmt.get();
        const conductorId = chofer ? chofer.id : 'cond-default';
        const conductorNombre = chofer ? chofer.nombre : 'Hernán Fernández';
        const vehiculo = chofer ? chofer.vehiculo : 'Chevrolet Cruze (AB-123-CD)';
        const stmtExito = dbM5.prepare(`
      INSERT INTO solicitudes_despacho (id, reserva_id, conductor_id, conductor_nombre, vehiculo, estado, fecha_hora)
      VALUES (?, ?, ?, ?, ?, 'ASIGNADO', ?)
    `);
        stmtExito.run(solicitudId, params.reservaId, conductorId, conductorNombre, vehiculo, ahora);
        Logger.sagaStep('Tp', 'M5', `Transacción Pivotante Superada: Chofer ${conductorNombre} asignado`, 'OK', requestId);
        return {
            id: solicitudId,
            reservaId: params.reservaId,
            conductorId,
            conductorNombre,
            vehiculo,
            estado: 'ASIGNADO',
            fechaHora: ahora
        };
    }
    /**
     * Método de inspección para evidencias técnicas:
     * Consulta únicamente la base de datos de M5.
     */
    static obtenerSolicitudPorReserva(reservaId) {
        const stmt = dbM5.prepare('SELECT * FROM solicitudes_despacho WHERE reserva_id = ? ORDER BY fecha_hora DESC LIMIT 1');
        const row = stmt.get(reservaId);
        if (!row)
            return null;
        return {
            id: row.id,
            reservaId: row.reserva_id,
            conductorId: row.conductor_id || null,
            conductorNombre: row.conductor_nombre || null,
            vehiculo: row.vehiculo || null,
            estado: row.estado,
            fechaHora: row.fecha_hora
        };
    }
}

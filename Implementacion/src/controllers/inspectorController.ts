import { Request, Response } from 'express';
import { dbM9, dbM7, dbM5 } from '../config/database.js';

export class InspectorController {
  public static inspeccionar(req: Request, res: Response): void {
    // 1. Datos en M9
    const reservasM9 = dbM9.prepare('SELECT * FROM reservas').all();
    const historialM9 = dbM9.prepare('SELECT * FROM historial_reservas').all();
    const idempotenciaM9 = dbM9.prepare('SELECT * FROM idempotencia').all();

    // 2. Datos en M7
    const transaccionesM7 = dbM7.prepare('SELECT * FROM transacciones').all();

    // 3. Datos en M5
    const despachosM5 = dbM5.prepare('SELECT * FROM solicitudes_despacho').all();
    const conductoresM5 = dbM5.prepare('SELECT * FROM conductores').all();

    res.json({
      explicacion: 'Estado de las 3 bases de datos físicamente aisladas (Database per Service)',
      base_datos_M9_reservas: {
        archivo: 'data/m9_reservas.db',
        totalReservas: reservasM9.length,
        reservas: reservasM9,
        historialAuditoria: historialM9,
        clavesIdempotencia: idempotenciaM9
      },
      base_datos_M7_pagos: {
        archivo: 'data/m7_pagos.db',
        totalTransacciones: transaccionesM7.length,
        transacciones: transaccionesM7
      },
      base_datos_M5_despacho: {
        archivo: 'data/m5_despacho.db',
        totalSolicitudes: despachosM5.length,
        solicitudes: despachosM5,
        conductoresRegistrados: conductoresM5
      }
    });
  }
}

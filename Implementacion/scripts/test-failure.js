import { app } from '../dist/app.js';
import { inicializarBasesDeDatos, dbM9, dbM7, dbM5 } from '../dist/config/database.js';

const PORT = 8097;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  console.log('[TEST] Iniciando prueba automatizada de Flujo con Fallo y Compensación...');
  inicializarBasesDeDatos();

  const server = app.listen(PORT);

  try {
    // 1. Crear reserva
    const resCrear = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli-test-err',
        origen: 'Zona Remota',
        destino: 'Periferia',
        tarifaEstimada: 6000
      })
    });
    const { reserva } = await resCrear.json();

    // 2. Ejecutar saga forzando fallo en T3 (M5)
    const resSaga = await fetch(`${BASE_URL}/reservas/${reserva.id}/activar-saga`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `idem-err-${Date.now()}`
      },
      body: JSON.stringify({ forzarFalloM5: true })
    });
    const saga = await resSaga.json();

    // 3. Aserciones
    if (saga.exito !== false) throw new Error('Se esperaba saga.exito === false');
    if (saga.estadoFinal !== 'VENCIDA') throw new Error(`Estado esperado VENCIDA, recibido: ${saga.estadoFinal}`);
    if (saga.saldoRetenidoM7 !== 0) throw new Error(`Saldo retenido esperado $0, recibido: ${saga.saldoRetenidoM7}`);

    // 4. Verificar base M9: Estado VENCIDA y evento en historial
    const m9Res = dbM9.prepare('SELECT * FROM reservas WHERE id = ?').get(reserva.id);
    if (m9Res.estado !== 'VENCIDA') throw new Error('db_m9 no está en estado VENCIDA tras compensación');

    const m9Hist = dbM9.prepare('SELECT * FROM historial_reservas WHERE reserva_id = ? AND tipo_evento = ?').get(reserva.id, 'RESERVA_VENCIDA');
    if (!m9Hist) throw new Error('No se registró la auditoría inmutable de RESERVA_VENCIDA en db_m9');

    // 5. Verificar base M7: Estado LIBERADO (Rollback lógico comprobado)
    const m7Tx = dbM7.prepare('SELECT * FROM transacciones WHERE reserva_id = ?').get(reserva.id);
    if (m7Tx.estado !== 'LIBERADO') throw new Error(`db_pagos debería estar en LIBERADO, pero está en: ${m7Tx.estado}`);

    // 6. Verificar base M5: Estado SIN_CONDUCTOR
    const m5Desp = dbM5.prepare('SELECT * FROM solicitudes_despacho WHERE reserva_id = ?').get(reserva.id);
    if (m5Desp.estado !== 'SIN_CONDUCTOR') throw new Error('db_despacho no está en SIN_CONDUCTOR');

    console.log('[✔] TEST PASÓ: Rollback lógico y transacciones compensatorias verificadas en las 3 bases de datos.\n');
  } catch (err) {
    console.error('[X] TEST FALLÓ:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

run();

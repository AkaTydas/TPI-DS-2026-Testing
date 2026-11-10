import { app } from '../dist/app.js';
import { inicializarBasesDeDatos, dbM9, dbM7, dbM5 } from '../dist/config/database.js';

const PORT = 8096;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  console.log('[TEST] Iniciando prueba automatizada de Flujo Exitoso (Saga OK)...');
  inicializarBasesDeDatos();

  const server = app.listen(PORT);

  try {
    // 1. Crear reserva
    const resCrear = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli-test-ok',
        origen: 'Centro',
        destino: 'Aeropuerto',
        tarifaEstimada: 4000
      })
    });
    const { reserva } = await resCrear.json();

    // 2. Ejecutar saga con éxito
    const resSaga = await fetch(`${BASE_URL}/reservas/${reserva.id}/activar-saga`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `idem-ok-${Date.now()}`
      },
      body: JSON.stringify({ forzarFalloM5: false })
    });
    const saga = await resSaga.json();

    // 3. Aserciones
    if (!saga.exito) throw new Error('Se esperaba saga.exito === true');
    if (saga.estadoFinal !== 'ACTIVADA') throw new Error(`Estado esperado ACTIVADA, recibido: ${saga.estadoFinal}`);
    if (saga.saldoRetenidoM7 !== 4000) throw new Error('Saldo retenido en M7 incorrecto');

    // 4. Verificar base M9
    const m9Res = dbM9.prepare('SELECT * FROM reservas WHERE id = ?').get(reserva.id);
    if (m9Res.estado !== 'ACTIVADA') throw new Error('db_m9 no está en estado ACTIVADA');

    // 5. Verificar base M7
    const m7Tx = dbM7.prepare('SELECT * FROM transacciones WHERE reserva_id = ?').get(reserva.id);
    if (m7Tx.estado !== 'PRE_AUTORIZADO') throw new Error('db_pagos no está en PRE_AUTORIZADO');

    // 6. Verificar base M5
    const m5Desp = dbM5.prepare('SELECT * FROM solicitudes_despacho WHERE reserva_id = ?').get(reserva.id);
    if (m5Desp.estado !== 'ASIGNADO') throw new Error('db_despacho no está en ASIGNADO');

    console.log('✅ TEST PASÓ: Flujo exitoso verificado en código y en las 3 bases de datos.\n');
  } catch (err) {
    console.error('❌ TEST FALLÓ:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

run();

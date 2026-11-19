import assert from 'node:assert/strict';
import { app } from '../dist/app.js';
import { dbM9, dbM7, dbM5 } from '../dist/config/database.js';
import { limpiarBases } from './test-helpers.js';

const PORT = 8096;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  console.log('[TEST] Iniciando prueba automatizada de Flujo Exitoso (Saga OK)...');
  limpiarBases();

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
    assert.strictEqual(resCrear.status, 201, 'Se esperaba HTTP 201 al crear la reserva');
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
    assert.strictEqual(resSaga.status, 200, 'Se esperaba HTTP 200 al activar la saga');
    const saga = await resSaga.json();

    // 3. Aserciones HTTP
    assert.strictEqual(saga.exito, true, 'Se esperaba saga.exito === true');
    assert.strictEqual(saga.estadoFinal, 'ACTIVADA', `Estado esperado ACTIVADA, recibido: ${saga.estadoFinal}`);
    assert.strictEqual(saga.saldoRetenidoM7, 4000, 'Saldo retenido en M7 incorrecto');

    // 4. Verificar base M9
    const m9Res = dbM9.prepare('SELECT * FROM reservas WHERE id = ?').get(reserva.id);
    assert.strictEqual(m9Res?.estado, 'ACTIVADA', 'db_m9 no está en estado ACTIVADA');

    // 5. Verificar base M7
    const m7Tx = dbM7.prepare('SELECT * FROM transacciones WHERE reserva_id = ?').get(reserva.id);
    assert.strictEqual(m7Tx?.estado, 'PRE_AUTORIZADO', 'db_pagos no está en PRE_AUTORIZADO');

    // 6. Verificar base M5
    const m5Desp = dbM5.prepare('SELECT * FROM solicitudes_despacho WHERE reserva_id = ?').get(reserva.id);
    assert.strictEqual(m5Desp?.estado, 'ASIGNADO', 'db_despacho no está en ASIGNADO');

    console.log('[✔] TEST PASÓ: Flujo exitoso verificado en código y en las 3 bases de datos.\n');
  } catch (err) {
    console.error('[X] TEST FALLÓ:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

run();

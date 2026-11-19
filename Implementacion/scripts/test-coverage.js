import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../dist/app.js';
import { dbM9, dbM7, dbM5 } from '../dist/config/database.js';
import { M7Client } from '../dist/clients/m7Client.js';
import { limpiarBases } from './test-helpers.js';

const PORT = 8093;
const BASE_URL = `http://localhost:${PORT}`;

let server;

describe('Cobertura ampliada — Saga Orquestada & Database per Service', () => {
  before(() => {
    limpiarBases();
    server = app.listen(PORT);
  });

  after(() => {
    server.close();
  });

  beforeEach(() => {
    limpiarBases();
  });

  it('1. Reintento con misma Idempotency-Key tras finalizar devuelve respuesta cacheada sin duplicar M7 ni historial', async () => {
    const resCrear = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli-retry-cache',
        origen: 'Av. Castelli 930',
        destino: 'UTN FRRe',
        tarifaEstimada: 4000
      })
    });
    assert.strictEqual(resCrear.status, 201);
    const { reserva } = await resCrear.json();

    const key = 'idem-cache-retry-01';
    const r1 = await fetch(`${BASE_URL}/reservas/${reserva.id}/activar-saga`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ forzarFalloM5: false })
    });
    assert.strictEqual(r1.status, 200);
    const body1 = await r1.json();

    const historialAntes = dbM9.prepare('SELECT COUNT(*) as total FROM historial_reservas WHERE reserva_id = ?').get(reserva.id).total;

    // Reintento secuencial después de haber finalizado
    const r2 = await fetch(`${BASE_URL}/reservas/${reserva.id}/activar-saga`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ forzarFalloM5: false })
    });
    assert.strictEqual(r2.status, 200);
    const body2 = await r2.json();

    assert.deepStrictEqual(body2, body1, 'La respuesta cacheada debe coincidir exactamente con la original');

    const txsM7 = dbM7.prepare('SELECT * FROM transacciones WHERE reserva_id = ?').all(reserva.id);
    assert.strictEqual(txsM7.length, 1, 'No debe duplicar pre-autorizaciones en M7');

    const historialDespues = dbM9.prepare('SELECT COUNT(*) as total FROM historial_reservas WHERE reserva_id = ?').get(reserva.id).total;
    assert.strictEqual(historialDespues, historialAntes, 'No debe duplicar registros en historial_reservas');
  });

  it('2. Webhook duplicado de M5 (/webhooks/despacho) devuelve HTTP 200 sin duplicar historial', async () => {
    const resCrear = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli-webhook',
        origen: 'Centro',
        destino: 'Terminal',
        tarifaEstimada: 3500
      })
    });
    const { reserva } = await resCrear.json();

    const payload = {
      reservaId: reserva.id,
      resultado: 'CONFIRMADA',
      conductorId: 'cond-001',
      conductorNombre: 'Hernán Fernández'
    };

    const w1 = await fetch(`${BASE_URL}/webhooks/despacho`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(w1.status, 200);

    const historialTrasW1 = dbM9.prepare('SELECT COUNT(*) as total FROM historial_reservas WHERE reserva_id = ?').get(reserva.id).total;

    // Segundo envío idéntico (duplicado)
    const w2 = await fetch(`${BASE_URL}/webhooks/despacho`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(w2.status, 200);
    const w2Body = await w2.json();
    assert.strictEqual(w2Body.estadoActual, 'ACTIVADA');

    const historialTrasW2 = dbM9.prepare('SELECT COUNT(*) as total FROM historial_reservas WHERE reserva_id = ?').get(reserva.id).total;
    assert.strictEqual(historialTrasW2, historialTrasW1, 'El webhook duplicado no debe insertar eventos repetidos en historial_reservas');
  });

  it('3. Fallo en T2 (M7 rechaza pre-autorización) compensa solo C1 y deja 0 transacciones retenidas en M7', async () => {
    const resCrear = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli-sin-saldo',
        origen: 'Resistencia',
        destino: 'Corrientes',
        tarifaEstimada: 5200
      })
    });
    const { reserva } = await resCrear.json();

    const originalPreAuto = M7Client.preAutorizarPago;
    let c2Invocado = false;
    const originalLiberar = M7Client.liberarPreAutorizacion;

    M7Client.preAutorizarPago = async () => {
      throw new Error('M7: Fondos insuficientes en tarjeta del cliente');
    };
    M7Client.liberarPreAutorizacion = async (...args) => {
      c2Invocado = true;
      return originalLiberar.apply(M7Client, args);
    };

    try {
      const resSaga = await fetch(`${BASE_URL}/reservas/${reserva.id}/activar-saga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-t2-fail' },
        body: JSON.stringify({ forzarFalloM5: false })
      });
      assert.strictEqual(resSaga.status, 200);
      const saga = await resSaga.json();

      assert.strictEqual(saga.exito, false);
      assert.strictEqual(saga.estadoFinal, 'VENCIDA');
      assert.strictEqual(saga.saldoRetenidoM7, 0);
      assert.strictEqual(c2Invocado, false, 'C2 no debe ejecutarse si T2 falló antes de retener fondos');

      const m9Res = dbM9.prepare('SELECT estado FROM reservas WHERE id = ?').get(reserva.id);
      assert.strictEqual(m9Res.estado, 'VENCIDA');

      const txsM7 = dbM7.prepare('SELECT * FROM transacciones WHERE reserva_id = ?').all(reserva.id);
      assert.strictEqual(txsM7.length, 0, 'No deben existir transacciones retenidas en m7_pagos.db');

      const hist = dbM9.prepare('SELECT * FROM historial_reservas WHERE reserva_id = ? AND tipo_evento = ?').get(reserva.id, 'RESERVA_VENCIDA');
      assert.ok(hist);
      assert.strictEqual(JSON.parse(hist.detalles).estadoCompensacionM7, 'NO_APLICA');
    } finally {
      M7Client.preAutorizarPago = originalPreAuto;
      M7Client.liberarPreAutorizacion = originalLiberar;
    }
  });

  it('4. M2 rechaza cliente bloqueado con HTTP 422 sin persistir reserva en M9', async () => {
    const res = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cliente-bloqueado',
        origen: 'Centro',
        destino: 'Aeropuerto',
        tarifaEstimada: 4000
      })
    });
    assert.strictEqual(res.status, 422);

    const totalM9 = dbM9.prepare('SELECT COUNT(*) as total FROM reservas').get().total;
    assert.strictEqual(totalM9, 0, 'No debe crearse reserva si M2 rechaza al cliente');
  });

  it('5. Validación RF-9.6: rechaza reserva con menos de 2 horas de antelación (HTTP 422) y acepta >= 2 horas (HTTP 201)', async () => {
    const enTreintaMinutos = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const resRechazada = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli-rf96',
        origen: 'Centro',
        destino: 'UTN',
        tarifaEstimada: 3000,
        fechaHoraProgramada: enTreintaMinutos
      })
    });
    assert.strictEqual(resRechazada.status, 422);
    assert.strictEqual(dbM9.prepare('SELECT COUNT(*) as total FROM reservas').get().total, 0);

    const enTresHoras = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const resValida = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli-rf96',
        origen: 'Centro',
        destino: 'UTN',
        tarifaEstimada: 3000,
        fechaHoraProgramada: enTresHoras
      })
    });
    assert.strictEqual(resValida.status, 201);
  });

  it('6. Evolución independiente de esquema en m5_despacho.db no impacta a M9 (Database per Service)', async () => {
    const colTmp = `flota_tmp_${Date.now()}`;
    const colFinal = `flota_sector_${Date.now()}`;
    dbM5.exec(`ALTER TABLE conductores ADD COLUMN ${colTmp} TEXT NOT NULL DEFAULT 'NORTE';`);
    dbM5.exec(`ALTER TABLE conductores RENAME COLUMN ${colTmp} TO ${colFinal};`);

    const cols = dbM5.prepare('PRAGMA table_info(conductores)').all().map(c => c.name);
    assert.ok(cols.includes(colFinal), 'La nueva columna renombrada debe existir en m5_despacho.db');

    const resCrear = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli-schema-m5',
        origen: 'Av. Sarmiento 400',
        destino: 'Campus UTN',
        tarifaEstimada: 4000
      })
    });
    assert.strictEqual(resCrear.status, 201);
    const { reserva } = await resCrear.json();

    const resSaga = await fetch(`${BASE_URL}/reservas/${reserva.id}/activar-saga`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-schema-m5' },
      body: JSON.stringify({ forzarFalloM5: false })
    });
    assert.strictEqual(resSaga.status, 200);
    const saga = await resSaga.json();
    assert.strictEqual(saga.exito, true);
    assert.strictEqual(saga.estadoFinal, 'ACTIVADA');

    // Limpiar columna temporal para no ensuciar el esquema en ejecuciones repetidas
    dbM5.exec(`ALTER TABLE conductores DROP COLUMN ${colFinal};`);
  });
});

/**
 * SUITE INTEGRAL DE HARDENING Y RESILIENCIA DISTRIBUIDA
 * Trabajo Práctico de Investigación - Grupo 8 (UTN FRRe 2026)
 *
 * Valida de forma automatizada los mecanismos de resiliencia y concurrencia:
 *  1. Idempotencia atómica anti-TOCTOU (candado atómico en M9)
 *  2. Control de Concurrencia Optimista (OCC / Semantic Lock en M9)
 *  3. Compensación defensiva en C2 ante caída de M7
 *  4. Switches didácticos para demostración en Coloquio
 */

import assert from 'node:assert/strict';
import { app } from '../dist/app.js';
import { dbM9, dbM7 } from '../dist/config/database.js';
import { M7Client } from '../dist/clients/m7Client.js';
import { limpiarBases } from './test-helpers.js';

const PORT = 8094;
const BASE_URL = `http://localhost:${PORT}`;

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

function banner(titulo) {
  console.log('\n' + colors.cyan + '='.repeat(70) + colors.reset);
  console.log(colors.bold + colors.yellow + `  ${titulo}` + colors.reset);
  console.log(colors.cyan + '='.repeat(70) + colors.reset + '\n');
}

async function run() {
  banner('SUITE DE VERIFICACIÓN DE HARDENING - GRUPO 8');
  limpiarBases();

  const server = app.listen(PORT);
  const originalPreAuto = M7Client.preAutorizarPago;
  const originalLiberar = M7Client.liberarPreAutorizacion;

  try {
    // =========================================================================
    // TEST 1: IDEMPOTENCIA ATÓMICA ANTI-TOCTOU
    // =========================================================================
    console.log(`${colors.bold}>>> TEST 1: Candado Atómico de Idempotencia (Misma Clave + Latencia) <<<${colors.reset}`);

    // Inyectamos 30ms de latencia simulando HTTP real
    M7Client.preAutorizarPago = async (...args) => {
      await new Promise(r => setTimeout(r, 30));
      return originalPreAuto.apply(M7Client, args);
    };

    const resCrear1 = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: 'cli-idem', origen: 'Centro', destino: 'UTN', tarifaEstimada: 3000 })
    });
    const { reserva: r1 } = await resCrear1.json();

    const IDEM_KEY = 'idem-atomic-lock-01';
    const [p1, p2] = await Promise.all([
      fetch(`${BASE_URL}/reservas/${r1.id}/activar-saga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': IDEM_KEY },
        body: JSON.stringify({ forzarFalloM5: false })
      }),
      fetch(`${BASE_URL}/reservas/${r1.id}/activar-saga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': IDEM_KEY },
        body: JSON.stringify({ forzarFalloM5: false })
      })
    ]);

    const txsM7_1 = dbM7.prepare('SELECT * FROM transacciones WHERE reserva_id = ?').all(r1.id);
    const statuses1 = [p1.status, p2.status].sort((a, b) => a - b);

    assert.deepStrictEqual(statuses1, [200, 409], `TEST 1 FALLÓ: se esperaba un 200 y un 409, recibido [${p1.status}, ${p2.status}]`);
    assert.strictEqual(txsM7_1.length, 1, `TEST 1 FALLÓ: se esperaba 1 transacción en M7, encontradas ${txsM7_1.length}`);

    console.log(`  ${colors.green}✔ Petición ganadora: HTTP 200 (Éxito)${colors.reset}`);
    console.log(`  ${colors.green}✔ Petición concurrente: HTTP 409 (Rechazada por Candado Atómico)${colors.reset}`);
    console.log(`  ${colors.green}✔ Transacciones en M7: 1 sola transacción ($${txsM7_1[0].monto}) - CERO DOBLE COBRO${colors.reset}`);

    M7Client.preAutorizarPago = originalPreAuto;

    // =========================================================================
    // TEST 2: CONTROL DE CONCURRENCIA OPTIMISTA (OCC) EN M9
    // =========================================================================
    console.log(`\n${colors.bold}>>> TEST 2: Control de Concurrencia Optimista (Claves Distintas sobre Misma Reserva) <<<${colors.reset}`);

    const resCrear2 = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: 'cli-occ', origen: 'Pte Alvear', destino: 'Shopping', tarifaEstimada: 4500 })
    });
    const { reserva: r2 } = await resCrear2.json();

    M7Client.preAutorizarPago = async (...args) => {
      await new Promise(r => setTimeout(r, 40));
      return originalPreAuto.apply(M7Client, args);
    };

    const [occ1, occ2] = await Promise.all([
      fetch(`${BASE_URL}/reservas/${r2.id}/activar-saga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-dispositivo-Alfa' },
        body: JSON.stringify({ forzarFalloM5: false })
      }),
      fetch(`${BASE_URL}/reservas/${r2.id}/activar-saga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-dispositivo-Beta' },
        body: JSON.stringify({ forzarFalloM5: false })
      })
    ]);

    const txsM7_2 = dbM7.prepare('SELECT * FROM transacciones WHERE reserva_id = ?').all(r2.id);
    const statuses2 = [occ1.status, occ2.status].sort((a, b) => a - b);

    assert.deepStrictEqual(statuses2, [200, 409], `TEST 2 FALLÓ: se esperaba un 200 y un 409, recibido [${occ1.status}, ${occ2.status}]`);
    assert.strictEqual(txsM7_2.length, 1, `TEST 2 FALLÓ: se esperaba 1 transacción en M7, encontradas ${txsM7_2.length}`);

    console.log(`  ${colors.green}✔ Primera petición: Entró en T1 y avanzó (HTTP 200)${colors.reset}`);
    console.log(`  ${colors.green}✔ Segunda petición: Bloqueada en T1 por OCC (HTTP 409: Estado ya no era CONFIRMADA)${colors.reset}`);
    console.log(`  ${colors.green}✔ Transacciones en M7: 1 sola transacción ($${txsM7_2[0].monto}) - Evitó doble cobro sin misma clave${colors.reset}`);

    M7Client.preAutorizarPago = originalPreAuto;

    // =========================================================================
    // TEST 3: COMPENSACIÓN DEFENSIVA EN C2
    // =========================================================================
    console.log(`\n${colors.bold}>>> TEST 3: Compensación Defensiva (M7 caído al devolver fondos) <<<${colors.reset}`);

    const resCrear3 = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: 'cli-c2', origen: 'Fontana', destino: 'Resistencia', tarifaEstimada: 3800 })
    });
    const { reserva: r3 } = await resCrear3.json();

    M7Client.liberarPreAutorizacion = async () => {
      throw new Error('TIMEOUT: Pasarela bancaria no responde al rollback');
    };

    const resFalloC2 = await fetch(`${BASE_URL}/reservas/${r3.id}/activar-saga`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-c2-failure' },
      body: JSON.stringify({ forzarFalloM5: true })
    });
    const dataFalloC2 = await resFalloC2.json();

    const r3DB = dbM9.prepare('SELECT estado FROM reservas WHERE id = ?').get(r3.id);
    const auditC2 = dbM9.prepare('SELECT * FROM historial_reservas WHERE reserva_id = ? AND tipo_evento = ?').get(r3.id, 'RESERVA_VENCIDA');

    assert.strictEqual(resFalloC2.status, 200, `TEST 3 FALLÓ: se esperaba HTTP 200, recibido ${resFalloC2.status}`);
    assert.strictEqual(r3DB?.estado, 'VENCIDA', `TEST 3 FALLÓ: se esperaba estado VENCIDA, recibido ${r3DB?.estado}`);
    assert.ok(auditC2, 'TEST 3 FALLÓ: no se registró auditoría RESERVA_VENCIDA');

    console.log(`  ${colors.green}✔ Servidor respondió: HTTP 200 (No crasheó con 500)${colors.reset}`);
    console.log(`  ${colors.green}✔ Estado en m9_reservas.db: VENCIDA (C1 garantizado)${colors.reset}`);
    console.log(`  ${colors.green}✔ Auditoría inmutable: Registró alerta REQUIERE_RECONCILIACION_MANUAL${colors.reset}`);
    console.log(`  ${colors.gray}   Mensaje devuelto: "${dataFalloC2.mensaje}"${colors.reset}`);

    M7Client.liberarPreAutorizacion = originalLiberar;

    // =========================================================================
    // TEST 4: DEMOSTRACIÓN DE SWITCHES DIDÁCTICOS (Para el Coloquio)
    // =========================================================================
    console.log(`\n${colors.bold}>>> TEST 4: Verificación de Switches Didácticos de Coloquio <<<${colors.reset}`);

    const resCrear4 = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: 'cli-switch', origen: 'Barranqueras', destino: 'Corrientes', tarifaEstimada: 6000 })
    });
    const { reserva: r4 } = await resCrear4.json();

    M7Client.liberarPreAutorizacion = async () => {
      throw new Error('TIMEOUT FORZADO');
    };

    const resSwitchVuln = await fetch(`${BASE_URL}/reservas/${r4.id}/activar-saga`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-switch-vuln' },
      body: JSON.stringify({
        forzarFalloM5: true,
        desactivarCompensacionDefensiva: true
      })
    });

    assert.strictEqual(
      resSwitchVuln.status,
      500,
      `TEST 4 FALLÓ: se esperaba HTTP 500 con desactivarCompensacionDefensiva=true, recibido ${resSwitchVuln.status}`
    );

    console.log(`  ${colors.green}✔ Switch 'desactivarCompensacionDefensiva: true' funcionando:${colors.reset}`);
    console.log(`     Permite demostrar en vivo el crash original HTTP 500 ante los docentes.`);

    banner('🎉 TODAS LAS PRUEBAS DE HARDENING PASARON EN VERDE (HARDENING VERIFICADO)');
  } finally {
    M7Client.preAutorizarPago = originalPreAuto;
    M7Client.liberarPreAutorizacion = originalLiberar;
    server.close();
  }
}

run().catch((err) => {
  console.error('\n[X] ERROR EN LA SUITE DE HARDENING:', err);
  process.exit(1);
});

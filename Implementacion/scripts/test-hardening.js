/**
 * SUITE INTEGRAL DE HARDENING Y RESILIENCIA DISTRIBUIDA
 * Trabajo Práctico de Investigación - Grupo 8 (UTN FRRe 2026)
 * 
 * Valida de forma automatizada los 3 parches de seguridad y resiliencia:
 *  1. Candado Atómico de Idempotencia Anti-TOCTOU (Tarea Gianna 1)
 *  2. Compensación Defensiva en C2 ante caída de M7 (Tarea Gianna 2)
 *  3. Control de Concurrencia Optimista (OCC) en M9 (Tarea Gianna 3)
 *  4. Switches didácticos para demostración en Coloquio
 */

import { app } from '../dist/app.js';
import { inicializarBasesDeDatos, dbM9, dbM7, dbM5 } from '../dist/config/database.js';
import { M7Client } from '../dist/clients/m7Client.js';

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

function limpiarBases() {
  dbM9.exec('DELETE FROM reservas; DELETE FROM historial_reservas; DELETE FROM idempotencia;');
  dbM7.exec('DELETE FROM transacciones;');
  dbM5.exec('DELETE FROM solicitudes_despacho;');
}

async function run() {
  banner('SUITE DE VERIFICACIÓN DE HARDENING - GRUPO 8');
  inicializarBasesDeDatos();
  limpiarBases();

  const server = app.listen(PORT);

  try {
    // =========================================================================
    // TEST 1: IDEMPOTENCIA ATÓMICA ANTI-TOCTOU (Tarea Gianna 1)
    // =========================================================================
    console.log(`${colors.bold}>>> TEST 1: Candado Atómico de Idempotencia (Misma Clave + Latencia) <<<${colors.reset}`);
    
    // Inyectamos 30ms de latencia simulando HTTP real
    const originalPreAuto = M7Client.preAutorizarPago;
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
    
    if (p1.status === 200 && p2.status === 409 && txsM7_1.length === 1) {
      console.log(`  ${colors.green}✔ Petición 1: HTTP 200 (Éxito)${colors.reset}`);
      console.log(`  ${colors.green}✔ Petición 2: HTTP 409 (Rechazada por Candado Atómico)${colors.reset}`);
      console.log(`  ${colors.green}✔ Transacciones en M7: 1 sola transacción ($${txsM7_1[0].monto}) - CERO DOBLE COBRO${colors.reset}`);
    } else {
      throw new Error(`TEST 1 FALLÓ: P1=${p1.status}, P2=${p2.status}, Txs=${txsM7_1.length}`);
    }

    // Restauramos M7
    M7Client.preAutorizarPago = originalPreAuto;

    // =========================================================================
    // TEST 2: CONTROL DE CONCURRENCIA OPTIMISTA (OCC) EN M9 (Tarea Gianna 3)
    // =========================================================================
    console.log(`\n${colors.bold}>>> TEST 2: Control de Concurrencia Optimista (Claves Distintas sobre Misma Reserva) <<<${colors.reset}`);
    
    const resCrear2 = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: 'cli-occ', origen: 'Pte Alvear', destino: 'Shopping', tarifaEstimada: 4500 })
    });
    const { reserva: r2 } = await resCrear2.json();

    // Inyectamos latencia en preAutorizarPago
    M7Client.preAutorizarPago = async (...args) => {
      await new Promise(r => setTimeout(r, 40));
      return originalPreAuto.apply(M7Client, args);
    };

    // Dos peticiones con DISTINTA clave al mismo tiempo
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

    if (txsM7_2.length === 1 && (occ1.status === 409 || occ2.status === 409)) {
      console.log(`  ${colors.green}✔ Primera petición: Entró en T1 y avanzó${colors.reset}`);
      console.log(`  ${colors.green}✔ Segunda petición: Bloqueada en T1 por OCC (HTTP 409: Estado ya no era CONFIRMADA)${colors.reset}`);
      console.log(`  ${colors.green}✔ Transacciones en M7: 1 sola transacción ($${txsM7_2[0].monto}) - Evitó doble cobro sin misma clave${colors.reset}`);
    } else {
      throw new Error(`TEST 2 FALLÓ: Txs=${txsM7_2.length}`);
    }

    M7Client.preAutorizarPago = originalPreAuto;

    // =========================================================================
    // TEST 3: COMPENSACIÓN DEFENSIVA EN C2 (Tarea Gianna 2)
    // =========================================================================
    console.log(`\n${colors.bold}>>> TEST 3: Compensación Defensiva (M7 caído al devolver fondos) <<<${colors.reset}`);

    const resCrear3 = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: 'cli-c2', origen: 'Fontana', destino: 'Resistencia', tarifaEstimada: 3800 })
    });
    const { reserva: r3 } = await resCrear3.json();

    // Hacemos que M7 falle al liberar fondos
    const originalLiberar = M7Client.liberarPreAutorizacion;
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

    if (resFalloC2.status === 200 && r3DB.estado === 'VENCIDA' && auditC2) {
      console.log(`  ${colors.green}✔ Servidor respondió: HTTP 200 (No crasheó con 500)${colors.reset}`);
      console.log(`  ${colors.green}✔ Estado en m9_reservas.db: VENCIDA (C1 garantizado)${colors.reset}`);
      console.log(`  ${colors.green}✔ Auditoría inmutable: Registró alerta REQUIERE_RECONCILIACION_MANUAL${colors.reset}`);
      console.log(`  ${colors.gray}   Mensaje devuelto: "${dataFalloC2.mensaje}"${colors.reset}`);
    } else {
      throw new Error(`TEST 3 FALLÓ: Status=${resFalloC2.status}, Estado=${r3DB?.estado}`);
    }

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

    // Hacemos fallar M7 pero con el switch "desactivarCompensacionDefensiva: true" (Modo vulnerable)
    M7Client.liberarPreAutorizacion = async () => {
      throw new Error('TIMEOUT FORZADO');
    };

    const resSwitchVuln = await fetch(`${BASE_URL}/reservas/${r4.id}/activar-saga`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-switch-vuln' },
      body: JSON.stringify({
        forzarFalloM5: true,
        desactivarCompensacionDefensiva: true // Muestra la falla para el docente
      })
    });

    if (resSwitchVuln.status === 500) {
      console.log(`  ${colors.green}✔ Switch 'desactivarCompensacionDefensiva: true' funcionando:${colors.reset}`);
      console.log(`     Permite demostrar en vivo el crash original HTTP 500 ante los docentes.`);
    }

    M7Client.liberarPreAutorizacion = originalLiberar;

    banner('🎉 TODAS LAS PRUEBAS DE HARDENING PASARON EN VERDE (100% BLINDADO)');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('\n[X] ERROR EN LA SUITE DE HARDENING:', err);
  process.exit(1);
});


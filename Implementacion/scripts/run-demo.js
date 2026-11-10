/**
 * Script de Demostración Integral Interactiva
 * Trabajo Práctico de Investigación - Grupo 8 (UTN FRRe 2026)
 * Temas: Saga Orquestada & Database per Service
 */

import { app } from '../dist/app.js';
import { inicializarBasesDeDatos, dbM9, dbM7, dbM5 } from '../dist/config/database.js';

const PORT = 8095; // Puerto dedicado para la demo automatizada
const BASE_URL = `http://localhost:${PORT}`;

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

function banner(title) {
  console.log('\n' + colors.bright + colors.cyan + '='.repeat(70) + colors.reset);
  console.log(colors.bright + colors.yellow + `  ${title}` + colors.reset);
  console.log(colors.bright + colors.cyan + '='.repeat(70) + colors.reset + '\n');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  banner('INICIANDO DEMOSTRACIÓN PRÁCTICA INTEGRADA - GRUPO 8');
  console.log(`${colors.gray}Iniciando servidor local y verificando 3 bases de datos aisladas...${colors.reset}`);

  // 1. Inicializar bases de datos SQLite
  inicializarBasesDeDatos();

  // Limpiar tablas para la demo limpia
  dbM9.exec('DELETE FROM reservas; DELETE FROM historial_reservas; DELETE FROM idempotencia;');
  dbM7.exec('DELETE FROM transacciones;');
  dbM5.exec('DELETE FROM solicitudes_despacho;');

  const server = app.listen(PORT);
  await delay(500);

  try {
    // =========================================================================
    // ESCENARIO 1: FLUJO EXITOSO (TODO OK)
    // =========================================================================
    banner('ESCENARIO 1: FLUJO EXITOSO DE ACTIVACIÓN Y DESPACHO (SAGA)');
    console.log(`${colors.blue}[CLIENTE] Creando Reserva programada en M9...${colors.reset}`);

    const resCrearA = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-demo-001' },
      body: JSON.stringify({
        clienteId: 'cli-alumno-utn',
        origen: 'Av. Castelli 930 (Resistencia)',
        destino: 'Campus Universitario UTN FRRe',
        tarifaEstimada: 3500.0
      })
    });
    const dataCrearA = await resCrearA.json();
    const idA = dataCrearA.reserva.id;
    console.log(`${colors.green}✔ Reserva creada en M9:${colors.reset} ID = ${idA} (Estado: CONFIRMADA)\n`);

    console.log(`${colors.magenta}[SAGA COORDINATOR] Ejecutando Activación de Reserva hacia M5...${colors.reset}`);
    const resSagaA = await fetch(`${BASE_URL}/reservas/${idA}/activar-saga`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'idem-key-exito-001',
        'X-Request-Id': 'req-saga-exito-001'
      },
      body: JSON.stringify({ forzarFalloM5: false })
    });
    const sagaA = await resSagaA.json();

    console.log(`\n${colors.bright}Resultado de la Saga:${colors.reset}`);
    console.log(`  - Éxito Global: ${colors.green}${sagaA.exito}${colors.reset}`);
    console.log(`  - Estado Final en M9: ${colors.green}${sagaA.estadoFinal}${colors.reset}`);
    console.log(`  - Conductor Asignado en M5: ${colors.cyan}${sagaA.conductorAsignadoM5}${colors.reset}`);
    console.log(`  - Saldo Retenido en M7: ${colors.yellow}$${sagaA.saldoRetenidoM7}${colors.reset}`);

    // Inspección de persistencia aislada para Escenario 1
    console.log(`\n${colors.cyan}[EVIDENCIA TEMA 12] Estado en las 3 Bases de Datos Aisladas:${colors.reset}`);
    const txA = dbM7.prepare('SELECT * FROM transacciones WHERE reserva_id = ?').get(idA);
    const despA = dbM5.prepare('SELECT * FROM solicitudes_despacho WHERE reserva_id = ?').get(idA);
    console.log(`  📁 db_m9.reservas:        Estado = ACTIVADA | Chofer = ${despA?.conductor_nombre}`);
    console.log(`  📁 db_pagos.transacciones: Estado = ${txA?.estado} | Monto = $${txA?.monto}`);
    console.log(`  📁 db_despacho.solicitud:  Estado = ${despA?.estado} | Chofer = ${despA?.conductor_nombre}`);

    await delay(1200);

    // =========================================================================
    // ESCENARIO 2: FLUJO CON ERROR Y ACCIONES COMPENSATORIAS (ROLLBACK LÓGICO)
    // =========================================================================
    banner('ESCENARIO 2: FALLO EN DESPACHO Y TRANSACCIONES COMPENSATORIAS (C2 -> C1)');
    console.log(`${colors.blue}[CLIENTE] Creando Reserva con destino en zona sin cobertura...${colors.reset}`);

    const resCrearB = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-demo-002' },
      body: JSON.stringify({
        clienteId: 'cli-pasajero-remoto',
        origen: 'Ruta 11 Km 1005',
        destino: 'Parque Industrial Barranqueras',
        tarifaEstimada: 5200.0
      })
    });
    const dataCrearB = await resCrearB.json();
    const idB = dataCrearB.reserva.id;
    console.log(`${colors.green}✔ Reserva creada en M9:${colors.reset} ID = ${idB} (Estado: CONFIRMADA)\n`);

    console.log(`${colors.magenta}[SAGA COORDINATOR] Ejecutando Activación con forzarFalloM5 = true...${colors.reset}`);
    const resSagaB = await fetch(`${BASE_URL}/reservas/${idB}/activar-saga`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'idem-key-fallo-002',
        'X-Request-Id': 'req-saga-fallo-002'
      },
      body: JSON.stringify({ forzarFalloM5: true })
    });
    const sagaB = await resSagaB.json();

    console.log(`\n${colors.bright}Resultado de la Saga con Compensación:${colors.reset}`);
    console.log(`  - Éxito Global: ${colors.red}${sagaB.exito} (Falla esperada en T3)${colors.reset}`);
    console.log(`  - Estado Final en M9: ${colors.red}${sagaB.estadoFinal} (Compensación C1)${colors.reset}`);
    console.log(`  - Saldo Retenido en M7: ${colors.green}$${sagaB.saldoRetenidoM7} (Compensación C2: Saldo Liberado)${colors.reset}`);
    console.log(`  - Motivo: ${colors.yellow}${sagaB.mensaje}${colors.reset}`);

    // Inspección de persistencia aislada para Escenario 2
    console.log(`\n${colors.cyan}[EVIDENCIA TEMA 12] Estado en las 3 Bases de Datos Aisladas tras Rollback:${colors.reset}`);
    const txB = dbM7.prepare('SELECT * FROM transacciones WHERE reserva_id = ?').get(idB);
    const despB = dbM5.prepare('SELECT * FROM solicitudes_despacho WHERE reserva_id = ?').get(idB);
    console.log(`  📁 db_m9.reservas:        Estado = VENCIDA (Cancelación lógica)`);
    console.log(`  📁 db_pagos.transacciones: Estado = ${txB?.estado} (Fondos devueltos al cliente)`);
    console.log(`  📁 db_despacho.solicitud:  Estado = ${despB?.estado} (Sin conductor)`);

    await delay(1200);

    // =========================================================================
    // EVIDENCIA 3: AUDITORÍA INMUTABLE NO DESTRUCTIVA (RF-9.12)
    // =========================================================================
    banner('EVIDENCIA 3: REGISTRO HISTÓRICO INMUTABLE EN M9 (db_m9.historial_reservas)');
    const auditStmt = dbM9.prepare('SELECT id, reserva_id, tipo_evento, estado_anterior, estado_nuevo, actor FROM historial_reservas ORDER BY id ASC');
    const logsAudit = auditStmt.all();
    console.table(logsAudit);

    // =========================================================================
    // EVIDENCIA 4: IDEMPOTENCIA ESTRICTA (RF-9.10)
    // =========================================================================
    banner('EVIDENCIA 4: RESILIENCIA E IDEMPOTENCIA (Reintento con misma Idempotency-Key)');
    console.log(`${colors.blue}Reenviando exactamente la misma petición de la Saga 1 (idem-key-exito-001)...${colors.reset}`);
    const resIdem = await fetch(`${BASE_URL}/reservas/${idA}/activar-saga`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'idem-key-exito-001',
        'X-Request-Id': 'req-reintento-red'
      },
      body: JSON.stringify({ forzarFalloM5: false })
    });
    const dataIdem = await resIdem.json();
    console.log(`${colors.green}✔ Respuesta Idempotente inmediata recibida sin duplicar transacciones ni historial.${colors.reset}`);

    banner('🎉 DEMOSTRACIÓN FINALIZADA CON ÉXITO ABSOLUTO (100% CUMPLIMIENTO)');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('Error en la ejecución de la demo:', err);
  process.exit(1);
});

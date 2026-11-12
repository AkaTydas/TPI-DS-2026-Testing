import { app } from '../dist/app.js';
import { inicializarBasesDeDatos, dbM9, dbM7, dbM5 } from '../dist/config/database.js';
import { M7Client } from '../dist/clients/m7Client.js';

const PORT = 8099;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  console.log('=================================================================');
  console.log(' LABORATORIO DE AUDITORÍA: ¿SON PROBLEMAS REALES O TEÓRICOS?');
  console.log('=================================================================\n');

  inicializarBasesDeDatos();

  dbM9.exec('DELETE FROM reservas; DELETE FROM historial_reservas; DELETE FROM idempotencia;');
  dbM7.exec('DELETE FROM transacciones;');
  dbM5.exec('DELETE FROM solicitudes_despacho;');

  const server = app.listen(PORT);

  try {
    // -------------------------------------------------------------------------
    // EXPERIMENTO 1: Falla en la Compensación C2 (M7 caído o con error)
    // -------------------------------------------------------------------------
    console.log('[#] EXPERIMENTO 1: ¿Qué pasa si el servicio de pagos falla al compensar?');
    console.log('Simulamos que M7 rechaza la liberación o se cae durante C2...\n');

    // Creamos reserva
    const res1 = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli-test-c2-failure',
        origen: 'Centro',
        destino: 'Periferia',
        tarifaEstimada: 4200.0
      })
    });
    const { reserva: r1 } = await res1.json();

    // Guardamos la implementación original de liberarPreAutorizacion y la hacemos fallar
    const originalLiberar = M7Client.liberarPreAutorizacion;
    M7Client.liberarPreAutorizacion = async () => {
      throw new Error('FATAL: M7_PAYMENTS_SERVICE_TIMEOUT (Pasarela inaccesible)');
    };

    // Ejecutamos la saga con fallo en M5 para forzar la compensación C2
    const resSaga1 = await fetch(`${BASE_URL}/reservas/${r1.id}/activar-saga`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-exp-1' },
      body: JSON.stringify({ forzarFalloM5: true })
    });

    console.log(`HTTP Status devuelto por la API: ${resSaga1.status}`);
    const dataSaga1 = await resSaga1.json();
    console.log('Respuesta del Servidor:', dataSaga1);

    // Inspeccionamos la base de datos de M9
    const r1Post = dbM9.prepare('SELECT id, estado FROM reservas WHERE id = ?').get(r1.id);
    console.log('\n(!) Estado en m9_reservas.db tras el fallo:');
    console.log(`  Estado esperado: "VENCIDA" (o estado de error compensado)`);
    console.log(`  Estado REAL obtenido: "${r1Post.estado}"`);

    if (r1Post.estado === 'EN_PROCESO_DESPACHO') {
      console.log('(!!) ¡BUG CONFIRMADO! La reserva quedó bloqueada como "EN_PROCESO_DESPACHO"');
      console.log('   y la excepción no controlada en C2 impidió que se marque como VENCIDA.\n');
    }

    // Restauramos M7Client
    M7Client.liberarPreAutorizacion = originalLiberar;

    // -------------------------------------------------------------------------
    // EXPERIMENTO 2: Concurrencia con Latencia de Red Real (Microservicios)
    // -------------------------------------------------------------------------
    console.log('-----------------------------------------------------------------');
    console.log('[#] EXPERIMENTO 2: ¿Por qué en local no hubo doble cobro pero en red sí?');
    console.log('En la demo local, SQLite corre en 0ms síncronos en el hilo de Node.');
    console.log('Simulamos una llamada de red real a M7 (30ms de latencia HTTP)...\n');

    const originalPreAuto = M7Client.preAutorizarPago;
    // Simulamos 30ms de latencia que cualquier llamada HTTP real tiene
    M7Client.preAutorizarPago = async (...args) => {
      await new Promise(r => setTimeout(r, 30));
      return originalPreAuto.apply(M7Client, args);
    };

    // Creamos reserva 2
    const res2 = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli-test-latency',
        origen: 'Av. 9 de Julio',
        destino: 'Barranqueras',
        tarifaEstimada: 3000.0
      })
    });
    const { reserva: r2 } = await res2.json();

    console.log(`Disparando 2 peticiones SIMULTÁNEAS con la misma Idempotency-Key...`);
    const [c1, c2] = await Promise.all([
      fetch(`${BASE_URL}/reservas/${r2.id}/activar-saga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-concurrente-real' },
        body: JSON.stringify({ forzarFalloM5: false })
      }),
      fetch(`${BASE_URL}/reservas/${r2.id}/activar-saga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-concurrente-real' },
        body: JSON.stringify({ forzarFalloM5: false })
      })
    ]);

    const txsR2 = dbM7.prepare('SELECT * FROM transacciones WHERE reserva_id = ?').all(r2.id);
    console.log('\n🔎 Inspeccionando transacciones en m7_pagos.db:');
    console.table(txsR2);

    if (txsR2.length > 1) {
      console.log(`(!!) ¡BUG DE CONCURRENCIA CONFIRMADO!`);
      console.log(`   Se generaron ${txsR2.length} transacciones de cobro en M7.`);
      console.log(`   Con apenas 30ms de latencia de red, la idempotencia falló por TOCTOU.`);
    } else {
      console.log('No se duplicó.');
    }

    M7Client.preAutorizarPago = originalPreAuto;

  } finally {
    server.close();
  }
}

run().catch(console.error);


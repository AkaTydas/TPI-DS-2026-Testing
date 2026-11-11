import { app } from '../dist/app.js';
import { inicializarBasesDeDatos, dbM9, dbM7, dbM5 } from '../dist/config/database.js';

const PORT = 8098;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  console.log('🧪 DEMOSTRANDO BUGS REALES DE CONCURRENCIA\n');
  inicializarBasesDeDatos();

  dbM9.exec('DELETE FROM reservas; DELETE FROM historial_reservas; DELETE FROM idempotencia;');
  dbM7.exec('DELETE FROM transacciones;');
  dbM5.exec('DELETE FROM solicitudes_despacho;');

  const server = app.listen(PORT);

  try {
    // 1. Crear una reserva
    const resCrear = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli-victima-doble-cobro',
        origen: 'Av. Sarmiento 100',
        destino: 'Shopping Sarmiento',
        tarifaEstimada: 5000.0
      })
    });
    const { reserva } = await resCrear.json();
    console.log(`✔ Reserva creada en M9: ID = ${reserva.id}`);

    // =========================================================================
    // CASO 1: Dos peticiones con DISTINTA Idempotency-Key
    // (Ejemplo: Dos operadores dan clic, o la app móvil genera un nuevo UUID por reintento)
    // =========================================================================
    console.log('\n--- CASO 1: 2 peticiones concurrentes con DISTINTA clave (Doble Activación) ---');
    const [resp1, resp2] = await Promise.all([
      fetch(`${BASE_URL}/reservas/${reserva.id}/activar-saga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-dispositivo-A' },
        body: JSON.stringify({ forzarFalloM5: false })
      }),
      fetch(`${BASE_URL}/reservas/${reserva.id}/activar-saga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-dispositivo-B' },
        body: JSON.stringify({ forzarFalloM5: false })
      })
    ]);

    const data1 = await resp1.json();
    const data2 = await resp2.json();

    console.log('  Petición A:', resp1.status, '| Éxito:', data1.exito, '| Estado final:', data1.estadoFinal);
    console.log('  Petición B:', resp2.status, '| Éxito:', data2.exito, '| Estado final:', data2.estadoFinal);

    const txsM7 = dbM7.prepare('SELECT * FROM transacciones WHERE reserva_id = ?').all(reserva.id);
    console.log('\n🔍 Inspeccionando m7_pagos.db (Transacciones registradas):');
    console.table(txsM7);

    const despachosM5 = dbM5.prepare('SELECT * FROM solicitudes_despacho WHERE reserva_id = ?').all(reserva.id);
    console.log('🔍 Inspeccionando m5_despacho.db (Solicitudes de chofer):');
    console.table(despachosM5);

    // =========================================================================
    // CASO 2: Falla no controlada en la compensación C2
    // =========================================================================
    console.log('\n--- CASO 2: ¿Qué pasa si la compensación C2 falla o arroja error? ---');
    // Para demostrarlo, creamos otra reserva y forzamos fallo
    const resCrear2 = await fetch(`${BASE_URL}/reservas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: 'cli-victima-crash',
        origen: 'Zona Norte',
        destino: 'Periferia',
        tarifaEstimada: 7500.0
      })
    });
    const dataRes2 = await resCrear2.json();
    const res2Id = dataRes2.reserva.id;

    // Ejecutamos la saga con fallo
    const respFallo = await fetch(`${BASE_URL}/reservas/${res2Id}/activar-saga`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-fallo-controlado' },
      body: JSON.stringify({ forzarFalloM5: true })
    });
    const dataFallo = await respFallo.json();
    console.log('  Fallo con rollback lógico normal:', dataFallo.mensaje);

  } finally {
    server.close();
  }
}

run().catch(console.error);

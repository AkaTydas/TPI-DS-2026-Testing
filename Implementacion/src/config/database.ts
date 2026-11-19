import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Directorio para las bases de datos SQLite físicamente aisladas (relativo a Implementacion/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../../data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 1. BASE DE DATOS EXCLUSIVA DE M9 (Reservas)
export const dbM9 = new DatabaseSync(path.join(dataDir, 'm9_reservas.db'));

// 2. BASE DE DATOS EXCLUSIVA DE M7 (Pagos)
export const dbM7 = new DatabaseSync(path.join(dataDir, 'm7_pagos.db'));

// 3. BASE DE DATOS EXCLUSIVA DE M5 (Despacho / Conductores)
export const dbM5 = new DatabaseSync(path.join(dataDir, 'm5_despacho.db'));

/**
 * Inicialización de esquemas completamente independientes (Database per Service)
 */
export function inicializarBasesDeDatos(): void {
  // Esquema M9: Solo reservas, historial no destructivo y claves de idempotencia
  dbM9.exec(`
    CREATE TABLE IF NOT EXISTS reservas (
      id TEXT PRIMARY KEY,
      cliente_id TEXT NOT NULL,
      origen TEXT NOT NULL,
      destino TEXT NOT NULL,
      tarifa_estimada REAL NOT NULL,
      estado TEXT NOT NULL,
      solicitud_despacho_id TEXT,
      conductor_id TEXT,
      clave_idempotencia TEXT NOT NULL,
      creado_en TEXT NOT NULL,
      actualizado_en TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS historial_reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reserva_id TEXT NOT NULL,
      tipo_evento TEXT NOT NULL,
      estado_anterior TEXT,
      estado_nuevo TEXT,
      actor TEXT NOT NULL,
      detalles TEXT,
      fecha_hora TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotencia (
      clave TEXT PRIMARY KEY,
      estado TEXT NOT NULL DEFAULT 'COMPLETADO',
      codigo_estado INTEGER,
      cuerpo_respuesta TEXT,
      creado_en TEXT NOT NULL
    );
  `);

  try {
    dbM9.exec(`ALTER TABLE idempotencia ADD COLUMN estado TEXT NOT NULL DEFAULT 'COMPLETADO';`);
  } catch {
    // Columna ya existe o tabla recién creada
  }

  // Esquema M7: Transacciones monetarias y pre-autorizaciones
  dbM7.exec(`
    CREATE TABLE IF NOT EXISTS transacciones (
      id TEXT PRIMARY KEY,
      reserva_id TEXT NOT NULL,
      monto REAL NOT NULL,
      estado TEXT NOT NULL,
      fecha_hora TEXT NOT NULL
    );
  `);

  // Esquema M5: Solicitudes de despacho y conductores
  dbM5.exec(`
    CREATE TABLE IF NOT EXISTS solicitudes_despacho (
      id TEXT PRIMARY KEY,
      reserva_id TEXT NOT NULL,
      conductor_id TEXT,
      conductor_nombre TEXT,
      vehiculo TEXT,
      estado TEXT NOT NULL,
      fecha_hora TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conductores (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      vehiculo TEXT NOT NULL,
      disponible INTEGER NOT NULL
    );
  `);

  // Semilla de prueba para conductores en M5
  const countStmt = dbM5.prepare('SELECT COUNT(*) as total FROM conductores');
  const count = (countStmt.get() as { total: number }).total;
  if (count === 0) {
    const insertConductor = dbM5.prepare(`
      INSERT INTO conductores (id, nombre, vehiculo, disponible)
      VALUES (?, ?, ?, ?)
    `);
    insertConductor.run('cond-001', 'Hernán Fernández', 'Chevrolet Cruze (AB-123-CD)', 1);
    insertConductor.run('cond-002', 'Sofía Alcaraz', 'Toyota Corolla (AF-987-QW)', 1);
  }
}

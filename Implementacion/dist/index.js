import { app } from './app.js';
import { inicializarBasesDeDatos } from './config/database.js';
import { Logger } from './utils/logger.js';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8090;
// 1. Inicializar las 3 bases de datos SQLite independientes
inicializarBasesDeDatos();
// 2. Levantar el servidor HTTP
app.listen(PORT, () => {
    Logger.info(`================================================================`);
    Logger.info(`🚀 Servidor Demo Grupo 8 iniciado en: http://localhost:${PORT}`);
    Logger.info(`📁 Persistencia: 3 Bases Aisladas (data/m9_reservas.db, data/m7_pagos.db, data/m5_despacho.db)`);
    Logger.info(`⚡ Saga Orquestada lista en: POST /reservas/:id/activar-saga`);
    Logger.info(`🔍 Auditoría multi-base en: GET /inspeccionar-bases`);
    Logger.info(`================================================================`);
});

import { dbM9 } from '../config/database.js';
export class IdempotencyRepository {
    static buscar(clave) {
        const stmt = dbM9.prepare('SELECT * FROM idempotencia WHERE clave = ?');
        const row = stmt.get(clave);
        if (!row)
            return null;
        return {
            clave: row.clave,
            codigoEstado: row.codigo_estado,
            cuerpoRespuesta: row.cuerpo_respuesta,
            creadoEn: row.creado_en
        };
    }
    static guardar(clave, codigoEstado, cuerpoRespuesta) {
        const stmt = dbM9.prepare(`
      INSERT OR REPLACE INTO idempotencia (clave, codigo_estado, cuerpo_respuesta, creado_en)
      VALUES (?, ?, ?, ?)
    `);
        stmt.run(clave, codigoEstado, typeof cuerpoRespuesta === 'string' ? cuerpoRespuesta : JSON.stringify(cuerpoRespuesta), new Date().toISOString());
    }
}

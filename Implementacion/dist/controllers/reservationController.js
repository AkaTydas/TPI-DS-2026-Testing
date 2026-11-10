import { ReservationRepository } from '../repositories/reservationRepository.js';
import { HistoryRepository } from '../repositories/historyRepository.js';
import { M2Client } from '../clients/m2Client.js';
import { randomUUID } from 'node:crypto';
export class ReservationController {
    static async crear(req, res) {
        try {
            const { clienteId, origen, destino, tarifaEstimada } = req.body;
            const requestId = req.headers['x-request-id'] || `req-${randomUUID().substring(0, 8)}`;
            if (!clienteId || !origen || !destino) {
                res.status(400).json({ error: 'clienteId, origen y destino son campos requeridos.' });
                return;
            }
            // 1. Validación de contrato externo con M2 (Data Ownership)
            await M2Client.verificarCliente(clienteId, requestId);
            const id = `res-${randomUUID().substring(0, 8)}`;
            const ahora = new Date().toISOString();
            const nuevaReserva = {
                id,
                clienteId,
                origen,
                destino,
                tarifaEstimada: Number(tarifaEstimada) || 3200.0,
                estado: 'CONFIRMADA',
                solicitudDespachoId: null,
                conductorId: null,
                claveIdempotencia: `idem-${id}`,
                creadoEn: ahora,
                actualizadoEn: ahora
            };
            // 2. Persistencia en la base de datos exclusiva de M9
            ReservationRepository.crear(nuevaReserva);
            // 3. Auditoría inicial inmutable
            HistoryRepository.registrar({
                reservaId: id,
                tipoEvento: 'RESERVA_CREADA',
                estadoAnterior: '',
                estadoNuevo: 'CONFIRMADA',
                actor: 'CLIENTE',
                detalles: { origen, destino, tarifaEstimada: nuevaReserva.tarifaEstimada },
                fechaHora: ahora
            });
            res.status(201).json({
                mensaje: 'Reserva creada con éxito en estado CONFIRMADA.',
                reserva: nuevaReserva
            });
        }
        catch (error) {
            const err = error;
            res.status(err.status || 500).json({
                error: err.title || 'Error interno',
                detalle: err.message
            });
        }
    }
    static obtenerPorId(req, res) {
        const { id } = req.params;
        const reserva = ReservationRepository.obtenerPorId(id);
        if (!reserva) {
            res.status(404).json({ error: `Reserva ${id} no encontrada en M9.` });
            return;
        }
        res.json(reserva);
    }
    static obtenerHistorial(req, res) {
        const { id } = req.params;
        const historial = HistoryRepository.obtenerPorReserva(id);
        res.json({ reservaId: id, totalEventos: historial.length, historial });
    }
    static listar(req, res) {
        const reservas = ReservationRepository.listar();
        res.json(reservas);
    }
}

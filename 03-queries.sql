-- =============================================================================
-- PROYECTO: Plataforma Distribuida de Movilidad Urbana - TPI 2026 (UTN FRRe)
-- MÓDULO:   M9 - Reservas de Viajes
-- GRUPO:    Grupo 8
-- ARCHIVO:  03-queries.sql (Consultas de Validación y Casos de Uso)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CONSULTA 1: Motor Scheduler / Worker de Activación (RF-9.9, RF-9.10)
-- Obtiene las reservas confirmadas cuya ventana de activación ya llegó y deben
-- ser enviadas al módulo M5 (Solicitud y Despacho).
-- Condición: (scheduled_at - activation_window_min <= AHORA) y estado = 'CONFIRMED'
-- -----------------------------------------------------------------------------
SELECT 
    id AS reservation_id,
    customer_id,
    vehicle_type,
    scheduled_at,
    pickup_address,
    pickup_latitude,
    pickup_longitude,
    dropoff_address,
    dropoff_latitude,
    dropoff_longitude,
    activation_idempotency_key,
    ROUND(EXTRACT(EPOCH FROM (scheduled_at - CURRENT_TIMESTAMP))/60, 1) AS minutos_faltantes_para_viaje
FROM reservations
WHERE status = 'CONFIRMED'
  AND scheduled_at - (activation_window_min || ' minutes')::INTERVAL <= CURRENT_TIMESTAMP
ORDER BY scheduled_at ASC;


-- -----------------------------------------------------------------------------
-- CONSULTA 2: Motor de Recordatorios (RF-9.8)
-- Trae los recordatorios agendados que están pendientes y deben ser enviados
-- a M8 (Notificaciones).
-- -----------------------------------------------------------------------------
SELECT 
    r.id AS reminder_id,
    res.id AS reservation_id,
    res.customer_id,
    res.scheduled_at,
    r.reminder_type,
    r.scheduled_for
FROM reservation_reminders r
JOIN reservations res ON r.reservation_id = res.id
WHERE r.status = 'PENDING'
  AND r.scheduled_for <= CURRENT_TIMESTAMP;


-- -----------------------------------------------------------------------------
-- CONSULTA 3: Historial y Auditoría de una Reserva (RF-9.12)
-- Muestra todas las transiciones de estado de forma no destructiva.
-- -----------------------------------------------------------------------------
SELECT 
    h.id AS history_id,
    h.reservation_id,
    h.previous_status,
    h.new_status,
    h.changed_by_role,
    h.reason,
    h.created_at AS transition_timestamp
FROM reservation_status_history h
ORDER BY h.created_at ASC;


-- -----------------------------------------------------------------------------
-- CONSULTA 4: Resumen de Reservas por Cliente (RF-2.4 / RF-9.1)
-- Vista general que consumiría el módulo de Clientes o el frontend del usuario.
-- -----------------------------------------------------------------------------
SELECT 
    id,
    customer_id,
    status,
    vehicle_type,
    scheduled_at,
    pickup_address,
    dropoff_address,
    estimated_fare,
    currency,
    dispatch_request_id,
    created_at
FROM reservations
WHERE customer_id = 'c1111111-1111-1111-1111-111111111111'
ORDER BY created_at DESC;


-- -----------------------------------------------------------------------------
-- CONSULTA 5: Métricas del Estado de Reservas (Dashboard Operador)
-- Muestra la cantidad de reservas en cada estado del ciclo de vida.
-- -----------------------------------------------------------------------------
SELECT 
    status,
    COUNT(*) AS total_reservas,
    COALESCE(SUM(estimated_fare), 0) AS total_estimado_ars
FROM reservations
GROUP BY status
ORDER BY total_reservas DESC;

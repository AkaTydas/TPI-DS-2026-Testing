-- =============================================================================
-- PROYECTO: Plataforma Distribuida de Movilidad Urbana - TPI 2026 (UTN FRRe)
-- MÓDULO:   M9 - Reservas de Viajes
-- GRUPO:    Grupo 8
-- ARCHIVO:  02-seed.sql (Datos de Prueba y Demostración)
-- =============================================================================

-- UUIDs fijos de clientes para demostración (referencias lógicas a M2)
-- Cliente 1: 'c1111111-1111-1111-1111-111111111111' (Juan Pérez)
-- Cliente 2: 'c2222222-2222-2222-2222-222222222222' (María Gómez)
-- Cliente 3: 'c3333333-3333-3333-3333-333333333333' (Lucas Benítez)

-- 1. RESERVA 1: CONFIRMADA para mañana (Flujo normal programado)
INSERT INTO reservations (
    id, customer_id, status, vehicle_type, scheduled_at, timezone,
    pickup_address, pickup_latitude, pickup_longitude,
    dropoff_address, dropoff_latitude, dropoff_longitude,
    estimated_distance_km, estimated_duration_min, estimated_fare, currency,
    activation_window_min, activation_idempotency_key
) VALUES (
    'a1111111-aaaa-1111-aaaa-111111111111',
    'c1111111-1111-1111-1111-111111111111',
    'CONFIRMED',
    'AUTO',
    CURRENT_TIMESTAMP + INTERVAL '1 day',
    'America/Argentina/Buenos_Aires',
    'French 414, Resistencia, Chaco (UTN FRRe)', -27.451200, -58.986600,
    'Aeropuerto Internacional de Resistencia', -27.448900, -59.056000,
    11.50, 22, 6500.00, 'ARS',
    15, '11111111-0001-aaaa-1111-222233334444'
);

-- Recordatorios para la Reserva 1
INSERT INTO reservation_reminders (
    reservation_id, reminder_type, scheduled_for, status
) VALUES 
('a1111111-aaaa-1111-aaaa-111111111111', '24_HOURS_BEFORE', CURRENT_TIMESTAMP + INTERVAL '1 hour', 'PENDING'),
('a1111111-aaaa-1111-aaaa-111111111111', '2_HOURS_BEFORE', CURRENT_TIMESTAMP + INTERVAL '22 hours', 'PENDING');

-- 2. RESERVA 2: CONFIRMADA para dentro de 10 minutos (Lista para que el Scheduler la active en M5)
INSERT INTO reservations (
    id, customer_id, status, vehicle_type, scheduled_at, timezone,
    pickup_address, pickup_latitude, pickup_longitude,
    dropoff_address, dropoff_latitude, dropoff_longitude,
    estimated_distance_km, estimated_duration_min, estimated_fare, currency,
    activation_window_min, activation_idempotency_key
) VALUES (
    'b2222222-bbbb-2222-bbbb-222222222222',
    'c2222222-2222-2222-2222-222222222222',
    'CONFIRMED',
    'MOTO',
    CURRENT_TIMESTAMP + INTERVAL '10 minutes',
    'America/Argentina/Buenos_Aires',
    'Plaza 25 de Mayo, Resistencia, Chaco', -27.451400, -58.986500,
    'Sarmiento Shopping, Resistencia, Chaco', -27.435000, -58.973000,
    3.80, 8, 2200.00, 'ARS',
    15, '22222222-0002-bbbb-2222-222233334444'
);

-- 3. RESERVA 3: ACTIVADA (Ya despachada exitosamente a M5 con request id asignado)
INSERT INTO reservations (
    id, customer_id, status, vehicle_type, scheduled_at, timezone,
    pickup_address, pickup_latitude, pickup_longitude,
    dropoff_address, dropoff_latitude, dropoff_longitude,
    estimated_distance_km, estimated_duration_min, estimated_fare, currency,
    activation_window_min, activation_idempotency_key, dispatch_request_id,
    created_at
) VALUES (
    'c3333333-cccc-3333-cccc-333333333333',
    'c3333333-3333-3333-3333-333333333333',
    'ACTIVATED',
    'AUTO',
    CURRENT_TIMESTAMP + INTERVAL '5 minutes',
    'America/Argentina/Buenos_Aires',
    'Av. Castelli y Las Heras, Resistencia, Chaco', -27.462000, -58.980000,
    'Hospital Perrando, Resistencia, Chaco', -27.454000, -58.972000,
    2.10, 6, 1800.00, 'ARS',
    15, '33333333-0003-cccc-3333-222233334444',
    'd5555555-5555-5555-5555-555555555555', -- ID devuelto por M5
    CURRENT_TIMESTAMP - INTERVAL '2 hours'
);

-- 4. RESERVA 4: CANCELADA POR EL CLIENTE (con motivo y penalidad)
INSERT INTO reservations (
    id, customer_id, status, vehicle_type, scheduled_at, timezone,
    pickup_address, pickup_latitude, pickup_longitude,
    dropoff_address, dropoff_latitude, dropoff_longitude,
    estimated_distance_km, estimated_duration_min, estimated_fare, currency,
    cancellation_fee, cancellation_reason, cancelled_by_role, cancelled_by_id,
    created_at
) VALUES (
    'd4444444-dddd-4444-dddd-444444444444',
    'c1111111-1111-1111-1111-111111111111',
    'CANCELLED_BY_CLIENT',
    'AUTO',
    CURRENT_TIMESTAMP + INTERVAL '3 hours',
    'America/Argentina/Buenos_Aires',
    'Parque 2 de Febrero, Resistencia', -27.442000, -58.985000,
    'Terminal de Ómnibus de Resistencia', -27.465000, -59.012000,
    5.60, 14, 3800.00, 'ARS',
    500.00, 'Cambio de planes de viaje del cliente', 'CUSTOMER', 'c1111111-1111-1111-1111-111111111111',
    CURRENT_TIMESTAMP - INTERVAL '1 day'
);

-- 5. RESERVA 5: EXPIRADA SIN CONDUCTORES (Demuestra RF-9.11)
INSERT INTO reservations (
    id, customer_id, status, vehicle_type, scheduled_at, timezone,
    pickup_address, pickup_latitude, pickup_longitude,
    dropoff_address, dropoff_latitude, dropoff_longitude,
    estimated_distance_km, estimated_duration_min, estimated_fare, currency,
    cancellation_reason, created_at
) VALUES (
    'e5555555-eeee-5555-eeee-555555555555',
    'c2222222-2222-2222-2222-222222222222',
    'EXPIRED_NO_DRIVERS',
    'AUTO',
    CURRENT_TIMESTAMP - INTERVAL '30 minutes',
    'America/Argentina/Buenos_Aires',
    'Barranqueras, Chaco', -27.481000, -58.932000,
    'Centro Resistencia', -27.451000, -58.986000,
    7.20, 18, 4200.00, 'ARS',
    'M5 Despacho informó que ningún conductor aceptó la oferta en el tiempo estipulado',
    CURRENT_TIMESTAMP - INTERVAL '5 hours'
);

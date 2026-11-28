#!/usr/bin/env bash
set -euo pipefail

CLIENTE_ACTIVO="11111111-1111-4111-8111-111111111111"
CLIENTE_BLOQUEADO="22222222-2222-4222-8222-222222222222"

echo "=== 1. Verificando salud de los 6 módulos + jwks-mock ==="
check() {
  local name="$1"
  local url="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)
  printf "  %-22s %-48s -> HTTP %s\n" "$name" "$url" "$code"
}

check "JWKS Mock" "http://localhost:8080/health"
check "M2 Clientes (G1)" "http://localhost:8082/health"
check "M4 Ubicación (G14)" "http://localhost:8084/health/ready"
check "M5 Despacho (G4)" "http://localhost:8085/health/ready"
check "M7 Tarifas (G6)" "http://localhost:8087/health"
check "M8 Notif (G10)" "http://localhost:8088/api/v1/health"
check "M9 Reservas (G8)" "http://localhost:8089/health"

echo ""
echo "=== 2. Generando tokens JWT de prueba ==="
TOKEN_CLIENTE_ACTIVO=$(curl -s "http://localhost:8080/token?sub=${CLIENTE_ACTIVO}&roles=CLIENTE" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).token)")
TOKEN_CLIENTE_BLOQUEADO=$(curl -s "http://localhost:8080/token?sub=${CLIENTE_BLOQUEADO}&roles=CLIENTE" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).token)")
TOKEN_OPERADOR=$(curl -s "http://localhost:8080/token?sub=99999999-9999-4999-8999-999999999999&roles=OPERADOR" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).token)")

echo ""
echo "=== 3. Creando clientes de prueba en M2 (http://localhost:8082) ==="
echo -n "  Cliente ACTIVO (${CLIENTE_ACTIVO}): "
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "http://localhost:8082/api/v1/clientes" \
  -H "Authorization: Bearer ${TOKEN_CLIENTE_ACTIVO}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: seed-cliente-activo-1" \
  -d '{"nombre":"Pablo","apellido":"Prueba","telefono":"+5493624111111"}'

echo -n "  Cliente BLOQUEADO (${CLIENTE_BLOQUEADO}) perfil: "
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "http://localhost:8082/api/v1/clientes" \
  -H "Authorization: Bearer ${TOKEN_CLIENTE_BLOQUEADO}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: seed-cliente-bloqueado-1" \
  -d '{"nombre":"Juan","apellido":"Bloqueado","telefono":"+5493624222222"}'

echo -n "  Aplicando bloqueo administrativo en M2: "
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "http://localhost:8082/api/v1/clientes/${CLIENTE_BLOQUEADO}/bloqueos" \
  -H "Authorization: Bearer ${TOKEN_OPERADOR}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: seed-bloqueo-1" \
  -d '{"motivo":"Bloqueo de prueba para test de integración M9 <-> M2"}'

echo ""
echo "=== 4. Creando reglas activas de tarifa en M7 (http://localhost:8087) ==="
echo -n "  Regla AUTO: "
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "http://localhost:8087/api/v1/tarifas/reglas" \
  -H "Content-Type: application/json" \
  -d '{"tipo_vehiculo":"auto","tarifa_base":1500,"precio_por_km":400,"precio_por_minuto":50,"tarifa_minima":2000,"cargo_cancelacion":1000,"activa":true}'

echo -n "  Regla MOTO: "
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "http://localhost:8087/api/v1/tarifas/reglas" \
  -H "Content-Type: application/json" \
  -d '{"tipo_vehiculo":"moto","tarifa_base":900,"precio_por_km":250,"precio_por_minuto":30,"tarifa_minima":1200,"cargo_cancelacion":600,"activa":true}'

echo ""
echo "=============================================================================="
echo "LISTO PARA PROBAR EN EL FRONTEND DE M9:  http://localhost:8089/"
echo "BANDEJA DE EMAILS REALES DE M8 (Mailpit): http://localhost:8025/"
echo "CONSOLA RABBITMQ (guest / guest):         http://localhost:15672/"
echo "=============================================================================="
echo ""
echo "--- JWT CLIENTE ACTIVO (sub=${CLIENTE_ACTIVO}) ---"
echo "${TOKEN_CLIENTE_ACTIVO}"
echo ""
echo "--- JWT CLIENTE BLOQUEADO (sub=${CLIENTE_BLOQUEADO}) ---"
echo "${TOKEN_CLIENTE_BLOQUEADO}"
echo ""
echo "--- JWT OPERADOR (para activar reservas hacia M5) ---"
echo "${TOKEN_OPERADOR}"
echo ""

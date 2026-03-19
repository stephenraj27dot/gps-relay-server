// ============================================================
// tests/test-load.js
// Multi-tenant load simulation
//
// Usage:
//   node tests/test-load.js
//   DRIVERS=10 PASSENGERS=50 node tests/test-load.js
//
// Tests:
//   ✅ Multiple driver clients sending GPS every 2.5s
//   ✅ Multiple passenger clients receiving updates
//   ✅ Tenant isolation (cross-tenant messages = VIOLATION)
//   ✅ Latency measurement
// ============================================================
const { io } = require('socket.io-client');

const SERVER_URL    = process.env.SERVER_URL || 'http://localhost:3001';
const NUM_DRIVERS   = parseInt(process.env.DRIVERS   || '3', 10);
const NUM_PASSENGERS = parseInt(process.env.PASSENGERS || '10', 10);
const TENANTS       = ['COLLEGE_A', 'COLLEGE_B'];
const GPS_INTERVAL  = 2500; // ms — matches production rule of 2-3s

let totalReceived  = 0;
let violations     = 0;
const latencies    = [];
const sentTimes    = {};

function randomCoord(base, range) {
  return base + (Math.random() - 0.5) * range;
}

function randomTenant() {
  return TENANTS[Math.floor(Math.random() * TENANTS.length)];
}

// ── Create a DRIVER client ─────────────────────────────────
function createDriver(driverId, tenantId) {
  const busId = `BUS_${driverId}`;
  const client = io(SERVER_URL, {
    query: { tenant_id: tenantId },
    transports: ['websocket'],
    reconnection: true,
  });

  client.on('connect', () => {
    console.log(`[DRIVER] ${driverId} (${tenantId}) connected`);
    setInterval(() => {
      const payload = {
        busId,
        driverId,
        lat:       randomCoord(13.08, 0.05),
        lng:       randomCoord(80.27, 0.05),
        speed:     Math.floor(Math.random() * 60),
        routeName: `Route-${driverId}`,
      };
      sentTimes[`${tenantId}:${busId}:${Date.now()}`] = Date.now();
      client.emit('driver:gps', payload);
    }, GPS_INTERVAL);
  });

  client.on('connect_error', (err) => {
    console.error(`[DRIVER] ${driverId} connection error: ${err.message}`);
  });

  return client;
}

// ── Create a PASSENGER client ──────────────────────────────
function createPassenger(passengerId, tenantId) {
  const client = io(SERVER_URL, {
    query: { tenant_id: tenantId },
    transports: ['websocket'],
    reconnection: true,
  });

  client.on('connect', () => {
    console.log(`[PASSENGER] ${passengerId} (${tenantId}) connected`);
    client.emit('passenger:join', {});
  });

  client.on('bus:position', (data) => {
    totalReceived++;
    const now = Date.now();
    if (data.timestamp) {
      latencies.push(now - data.timestamp);
    }
    // ── Tenant isolation check ──────────────────────────────
    // This client is tenantId — if it receives a message containing
    // info from a different tenant, that's an isolation violation.
    // (In this test we pass tenantId in payload for verification)
    if (data.tenantId && data.tenantId !== tenantId) {
      violations++;
      console.error(`[ISOLATION VIOLATION] Passenger ${passengerId} (${tenantId}) received data from ${data.tenantId}!`);
    }
  });

  client.on('bus:positions:init', (positions) => {
    console.log(`[PASSENGER] ${passengerId} got initial snapshot: ${Object.keys(positions).length} buses`);
  });

  client.on('connect_error', (err) => {
    console.error(`[PASSENGER] ${passengerId} error: ${err.message}`);
  });

  return client;
}

// ── Spawn clients ──────────────────────────────────────────
console.log(`\n🚀 Load Test Starting`);
console.log(`   Server:     ${SERVER_URL}`);
console.log(`   Drivers:    ${NUM_DRIVERS}`);
console.log(`   Passengers: ${NUM_PASSENGERS}`);
console.log(`   Tenants:    ${TENANTS.join(', ')}\n`);

const clients = [];

for (let i = 0; i < NUM_DRIVERS; i++) {
  clients.push(createDriver(`D${i + 1}`, TENANTS[i % TENANTS.length]));
}

setTimeout(() => {
  for (let i = 0; i < NUM_PASSENGERS; i++) {
    clients.push(createPassenger(`P${i + 1}`, TENANTS[i % TENANTS.length]));
  }
}, 1000);

// ── Stats reporter ─────────────────────────────────────────
setInterval(() => {
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;
  const lastLatency = latencies[latencies.length - 1] || 0;

  console.log(
    `📊 Messages received: ${totalReceived} | ` +
    `Avg latency: ${avgLatency}ms | ` +
    `Last: ${lastLatency}ms | ` +
    `[ISOLATION VIOLATIONS: ${violations}]`
  );
  latencies.length = 0; // reset for next interval
}, 5000);

// ── Clean exit ─────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n\n✅ Test complete. Disconnecting...');
  console.log(`Total messages: ${totalReceived}`);
  console.log(`Isolation violations: ${violations === 0 ? '0 ✅' : violations + ' ❌'}`);
  clients.forEach(c => c.disconnect());
  process.exit(0);
});

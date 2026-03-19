-- ============================================================
-- database/indexes.sql
-- Performance indexes for multi-tenant queries
-- Run AFTER schema.sql
-- ============================================================

-- Fast lookup: all users in a tenant
CREATE INDEX IF NOT EXISTS idx_users_tenant       ON users(tenant_id);

-- Fast lookup: all buses in a tenant
CREATE INDEX IF NOT EXISTS idx_buses_tenant       ON buses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_buses_tenant_bus   ON buses(tenant_id, bus_id);

-- Fast lookup: routes in a tenant
CREATE INDEX IF NOT EXISTS idx_routes_tenant      ON routes(tenant_id);

-- Composite index for GPS history queries (most common: by tenant + bus + time)
CREATE INDEX IF NOT EXISTS idx_history_tenant_bus ON location_history(tenant_id, bus_id);
CREATE INDEX IF NOT EXISTS idx_history_tenant_time ON location_history(tenant_id, recorded_at DESC);

-- For replay queries (get last N points for a bus)
CREATE INDEX IF NOT EXISTS idx_history_bus_time   ON location_history(bus_id, recorded_at DESC);

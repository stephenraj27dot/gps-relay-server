-- ============================================================
-- database/schema.sql
-- All tables include tenant_id (MANDATORY for multi-tenancy)
-- Run this once on your PostgreSQL instance
-- ============================================================

-- Tenants (colleges)
CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(200) NOT NULL,
    slug        VARCHAR(50)  UNIQUE NOT NULL,  -- used as tenant_id
    plan        VARCHAR(20)  DEFAULT 'free',
    created_at  TIMESTAMP    DEFAULT NOW()
);

-- Users (drivers, passengers, admins — per tenant)
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   VARCHAR(50)  NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
    email       VARCHAR(200) NOT NULL,
    role        VARCHAR(20)  NOT NULL CHECK (role IN ('driver','passenger','admin','staff')),
    name        VARCHAR(150),
    is_active   BOOLEAN      DEFAULT true,
    created_at  TIMESTAMP    DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- Buses (per tenant)
CREATE TABLE IF NOT EXISTS buses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   VARCHAR(50)  NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
    bus_id      VARCHAR(50)  NOT NULL,   -- e.g. "BUS001"
    driver_id   UUID REFERENCES users(id),
    plate       VARCHAR(20),
    capacity    INTEGER DEFAULT 50,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, bus_id)
);

-- Routes (per tenant)
CREATE TABLE IF NOT EXISTS routes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   VARCHAR(50)  NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    stops       JSONB        DEFAULT '[]',
    polyline    TEXT,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Location history (append-only GPS trail — never used for real-time)
CREATE TABLE IF NOT EXISTS location_history (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   VARCHAR(50)  NOT NULL,
    bus_id      VARCHAR(50)  NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    speed       REAL DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT NOW()
);

-- Partition hint (for large deployments, partition by tenant_id + month)
-- CREATE INDEX on location_history is in indexes.sql

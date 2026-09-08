-- 003_admin_auth.sql — admin/RBAC, user moderation, onboarding and audit attribution.
--
-- RULES (sec 5/6/7/8/49/29): idempotent ADD COLUMN IF NOT EXISTS; never destructive.

-- User moderation + onboarding columns (admin panel & auth middleware depend on these).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) NOT NULL DEFAULT 'NOT_SUBMITTED';
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE;

-- Audit enrichment (sec 49): attribute actions to an admin and a target resource.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS admin_id VARCHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target VARCHAR(128);

-- Promotions display columns (legacy backfill).
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS subtitle VARCHAR(255) DEFAULT 'DEPOSIT -> GET BONUS';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS tag VARCHAR(50) DEFAULT 'DEPOSIT';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS button_text VARCHAR(50) DEFAULT 'DEPOSIT NOW';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS image_url VARCHAR(255) DEFAULT '/banners/deposit_banner.png';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS target_screen VARCHAR(100) DEFAULT '/add-cash';

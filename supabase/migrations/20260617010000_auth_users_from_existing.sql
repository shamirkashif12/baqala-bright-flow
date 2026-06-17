-- ============================================================
-- Migration: Create Supabase auth.users for every existing
--            record in public.users so they can log in.
--            Password for all: Pakistan123@
--
-- Also ensures the 8 BRD roles are in the enum and
-- maps each user's role_id to the correct app_role.
-- ============================================================

-- ── 0. pgcrypto (needed for crypt / gen_salt) ────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Expand enum safely (idempotent) ───────────────────────
DO $$
BEGIN
  BEGIN
    ALTER TYPE public.app_role RENAME VALUE 'owner'   TO 'tenant_admin';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    ALTER TYPE public.app_role RENAME VALUE 'manager' TO 'branch_manager';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'storekeeper';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'picker';

-- ── 2. Update current_user_role() priority ───────────────────
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY CASE role
    WHEN 'tenant_admin'    THEN 1
    WHEN 'branch_manager'  THEN 2
    WHEN 'supervisor'      THEN 3
    WHEN 'storekeeper'     THEN 4
    WHEN 'finance_user'    THEN 5
    WHEN 'marketing_user'  THEN 6
    WHEN 'picker'          THEN 7
    ELSE                        8
  END
  LIMIT 1
$$;

-- ── 3. Role-id → app_role mapping ────────────────────────────
-- The role UUIDs in public.users are the role name encoded as
-- ASCII bytes in Windows GUID (little-endian) format.
--
--   tenant_admin    → 616e6574-746e-615f-646d-696e00000000
--   branch_manager  → 6e617262-6863-6d5f-616e-616765720000
--   cashier         → 68736163-6569-0072-0000-000000000000
--   storekeeper     → 726f7473-6b65-6565-7065-720000000000
--   supervisor      → 65707573-7672-7369-6f72-000000000000
--   finance_user    → 616e6966-636e-5f65-7573-657200000000
--   marketing_user  → 6b72616d-7465-6e69-675f-757365720000
--   picker          → 6b636970-7265-0000-0000-000000000000

-- ── 4. Create auth.users for every existing app user ─────────
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous,
  created_at, updated_at
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  u.email,
  crypt('Pakistan123@', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('name', u.name_en),
  false, false, false,
  now(), now()
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users au WHERE au.email = u.email
);

-- ── 5. Assign app_role to every auth user based on role_id ───
INSERT INTO public.user_roles (user_id, role)
SELECT
  au.id,
  CASE u.role_id::text
    WHEN '616e6574-746e-615f-646d-696e00000000' THEN 'tenant_admin'::public.app_role
    WHEN '6e617262-6863-6d5f-616e-616765720000' THEN 'branch_manager'::public.app_role
    WHEN '68736163-6569-0072-0000-000000000000' THEN 'cashier'::public.app_role
    WHEN '726f7473-6b65-6565-7065-720000000000' THEN 'storekeeper'::public.app_role
    WHEN '65707573-7672-7369-6f72-000000000000' THEN 'supervisor'::public.app_role
    WHEN '616e6966-636e-5f65-7573-657200000000' THEN 'finance_user'::public.app_role
    WHEN '6b72616d-7465-6e69-675f-757365720000' THEN 'marketing_user'::public.app_role
    WHEN '6b636970-7265-0000-0000-000000000000' THEN 'picker'::public.app_role
    ELSE 'cashier'::public.app_role
  END
FROM public.users u
JOIN auth.users au ON au.email = u.email
ON CONFLICT (user_id, role) DO NOTHING;

-- ── 6. Verify — run this SELECT to confirm after migration ────
-- SELECT au.email, ur.role
-- FROM auth.users au
-- JOIN public.user_roles ur ON ur.user_id = au.id
-- ORDER BY ur.role, au.email;

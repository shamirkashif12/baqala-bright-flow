-- ============================================================
-- Migration: Expand app_role enum to 8 BRD-defined roles
--            Seed one user per role + populate role_permissions
-- ============================================================

-- ── 1. Rename existing enum values ──────────────────────────
ALTER TYPE public.app_role RENAME VALUE 'owner'   TO 'tenant_admin';
ALTER TYPE public.app_role RENAME VALUE 'manager' TO 'branch_manager';

-- ── 2. Add new enum values ───────────────────────────────────
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'storekeeper';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'picker';

-- ── 3. Update current_user_role() priority order ────────────
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- ── 4. Seed users (one per role) ─────────────────────────────
-- All passwords: Pakistan123@
-- Email-confirmed so they can sign in immediately.

-- Branch Manager
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous,
  created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'sara.manager@baqala.sa',
  crypt('Pakistan123@', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Sara Al-Otaibi"}',
  false, false, false,
  now(), now()
) ON CONFLICT (email) DO NOTHING;

-- Cashier 1
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous,
  created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'ahmed.cashier@baqala.sa',
  crypt('Pakistan123@', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Ahmed Al-Rashidi"}',
  false, false, false,
  now(), now()
) ON CONFLICT (email) DO NOTHING;

-- Cashier 2
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous,
  created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'faisal.cashier@baqala.sa',
  crypt('Pakistan123@', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Faisal Al-Qahtani"}',
  false, false, false,
  now(), now()
) ON CONFLICT (email) DO NOTHING;

-- Storekeeper / Inventory User
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous,
  created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'khalid.stock@baqala.sa',
  crypt('Pakistan123@', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Khalid Al-Harbi"}',
  false, false, false,
  now(), now()
) ON CONFLICT (email) DO NOTHING;

-- Supervisor / Merchandiser
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous,
  created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'noura.supervisor@baqala.sa',
  crypt('Pakistan123@', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Noura Al-Shammari"}',
  false, false, false,
  now(), now()
) ON CONFLICT (email) DO NOTHING;

-- Finance / Accounts User
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous,
  created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'reem.finance@baqala.sa',
  crypt('Pakistan123@', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Reem Al-Dossari"}',
  false, false, false,
  now(), now()
) ON CONFLICT (email) DO NOTHING;

-- Marketing / CRM User
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous,
  created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'layla.marketing@baqala.sa',
  crypt('Pakistan123@', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Layla Al-Zahrani"}',
  false, false, false,
  now(), now()
) ON CONFLICT (email) DO NOTHING;

-- Picker / Delivery Assistant
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous,
  created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'omar.picker@baqala.sa',
  crypt('Pakistan123@', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Omar Al-Ghamdi"}',
  false, false, false,
  now(), now()
) ON CONFLICT (email) DO NOTHING;

-- ── 5. Assign roles to the new seed users ───────────────────
-- Remove auto-assigned cashier and assign the correct role for each user.

-- Branch Manager
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'branch_manager'::public.app_role FROM auth.users WHERE email = 'sara.manager@baqala.sa'
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id AND u.email = 'sara.manager@baqala.sa' AND ur.role = 'cashier';

-- Cashier 1 (keep cashier role as-is)
-- No change needed; trigger already assigns cashier

-- Cashier 2 (keep cashier role as-is)
-- No change needed; trigger already assigns cashier

-- Storekeeper
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'storekeeper'::public.app_role FROM auth.users WHERE email = 'khalid.stock@baqala.sa'
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id AND u.email = 'khalid.stock@baqala.sa' AND ur.role = 'cashier';

-- Supervisor
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'supervisor'::public.app_role FROM auth.users WHERE email = 'noura.supervisor@baqala.sa'
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id AND u.email = 'noura.supervisor@baqala.sa' AND ur.role = 'cashier';

-- Finance User
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'finance_user'::public.app_role FROM auth.users WHERE email = 'reem.finance@baqala.sa'
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id AND u.email = 'reem.finance@baqala.sa' AND ur.role = 'cashier';

-- Marketing User
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'marketing_user'::public.app_role FROM auth.users WHERE email = 'layla.marketing@baqala.sa'
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id AND u.email = 'layla.marketing@baqala.sa' AND ur.role = 'cashier';

-- Picker
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'picker'::public.app_role FROM auth.users WHERE email = 'omar.picker@baqala.sa'
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id AND u.email = 'omar.picker@baqala.sa' AND ur.role = 'cashier';

-- ── 6. Ensure tenant_admin role for ahmad.aziz@mytm.co ──────
-- The previous migration set this user as 'owner'; now renamed to 'tenant_admin'.
-- The rename above handles existing data; this is a safety net.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'tenant_admin'::public.app_role FROM auth.users WHERE email = 'ahmad.aziz@mytm.co'
ON CONFLICT (user_id, role) DO NOTHING;

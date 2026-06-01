-- Migration: Add user_whatsapp_accounts table
-- Purpose: Map WhatsApp phone numbers to OpsMind users for authentication
-- Created: 2025-05-14

-- Create the user_whatsapp_accounts table
CREATE TABLE IF NOT EXISTS public.user_whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  whatsapp_number text NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add unique constraint: one WhatsApp number per user
ALTER TABLE public.user_whatsapp_accounts
  ADD CONSTRAINT user_whatsapp_accounts_user_unique
  UNIQUE (user_id);

-- Add unique constraint: one user per WhatsApp number
ALTER TABLE public.user_whatsapp_accounts
  ADD CONSTRAINT user_whatsapp_accounts_phone_unique
  UNIQUE (whatsapp_number);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_number ON public.user_whatsapp_accounts(whatsapp_number) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_whatsapp_user_id ON public.user_whatsapp_accounts(user_id) WHERE is_active = true;

-- Add RLS (Row Level Security)
ALTER TABLE public.user_whatsapp_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read their own WhatsApp accounts
CREATE POLICY "Users can view own WhatsApp accounts"
  ON public.user_whatsapp_accounts
  FOR SELECT
  USING (user_id = auth.uid() OR exists (
    SELECT 1 FROM public.users
    WHERE public.users.id = auth.uid()
    AND public.users.role = 'super_admin'
  ));

-- RLS Policy: Users can insert their own WhatsApp account (linking)
CREATE POLICY "Users can insert own WhatsApp account"
  ON public.user_whatsapp_accounts
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS Policy: Users can update their own WhatsApp account
CREATE POLICY "Users can update own WhatsApp account"
  ON public.user_whatsapp_accounts
  FOR UPDATE
  USING (user_id = auth.uid());

-- RLS Policy: Super admin can manage all
CREATE POLICY "Super admins can manage all WhatsApp accounts"
  ON public.user_whatsapp_accounts
  FOR ALL
  USING (exists (
    SELECT 1 FROM public.users
    WHERE public.users.id = auth.uid()
    AND public.users.role = 'super_admin'
  ));

-- Add helper function to get WhatsApp accounts for a user
CREATE OR REPLACE FUNCTION public.get_user_whatsapp_accounts(user_uuid uuid)
RETURNS TABLE(
  id uuid,
  whatsapp_number text,
  is_verified boolean,
  is_active boolean,
  linked_at timestamptz,
  last_verified_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id,
    w.whatsapp_number,
    w.is_verified,
    w.is_active,
    w.linked_at,
    w.last_verified_at
  FROM public.user_whatsapp_accounts w
  WHERE w.user_id = user_uuid
    AND w.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add helper function to lookup user by WhatsApp number
CREATE OR REPLACE FUNCTION public.lookup_user_by_whatsapp(phone text)
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  role text,
  company_id uuid,
  is_verified boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.full_name,
    u.role,
    u.company_id,
    w.is_verified
  FROM public.users u
  INNER JOIN public.user_whatsapp_accounts w ON w.user_id = u.id
  WHERE w.whatsapp_number = phone
    AND w.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger to update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_whatsapp_accounts_updated_at ON public.user_whatsapp_accounts;
CREATE TRIGGER update_user_whatsapp_accounts_updated_at
  BEFORE UPDATE ON public.user_whatsapp_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.user_whatsapp_accounts IS 'Maps WhatsApp phone numbers to OpsMind users for WhatsApp authentication';
COMMENT ON COLUMN public.user_whatsapp_accounts.whatsapp_number IS 'Normalized WhatsApp number (without + prefix)';
COMMENT ON COLUMN public.user_whatsapp_accounts.is_verified IS 'Whether the WhatsApp number has been verified via OTP';
COMMENT ON COLUMN public.user_whatsapp_accounts.is_active IS 'Whether the WhatsApp link is active (can be deactivated)';
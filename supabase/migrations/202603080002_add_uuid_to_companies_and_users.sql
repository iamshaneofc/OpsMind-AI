-- Migration: Add UUID id columns to companies and users tables
-- This migration adds UUID id columns to support proper foreign key relationships

-- ============================================================================
-- 1. Add UUID id column to companies table
-- ============================================================================

-- Add UUID 'id' column to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

-- Set 'id' as primary key if not already
DO $$ 
BEGIN
  -- Check if there's already a primary key constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'companies_pkey' 
    AND contype = 'p'
  ) THEN
    -- If company_id is the current primary key, drop it first
    IF EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'companies_pkey' 
      AND contype = 'p'
      AND conrelid = 'public.companies'::regclass
    ) THEN
      ALTER TABLE public.companies DROP CONSTRAINT companies_pkey;
    END IF;
    ALTER TABLE public.companies ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Populate 'id' for existing rows where it's null
UPDATE public.companies
SET id = gen_random_uuid()
WHERE id IS NULL;

-- Make id NOT NULL after populating
ALTER TABLE public.companies 
ALTER COLUMN id SET NOT NULL;

-- ============================================================================
-- 2. Add UUID id column to users table
-- ============================================================================

-- Add UUID 'id' column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

-- Set 'id' as primary key if not already
DO $$ 
BEGIN
  -- Check if there's already a primary key constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_pkey' 
    AND contype = 'p'
  ) THEN
    -- If user_id is the current primary key, drop it first
    IF EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'users_pkey' 
      AND contype = 'p'
      AND conrelid = 'public.users'::regclass
    ) THEN
      ALTER TABLE public.users DROP CONSTRAINT users_pkey;
    END IF;
    ALTER TABLE public.users ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Populate 'id' for existing rows where it's null
UPDATE public.users
SET id = gen_random_uuid()
WHERE id IS NULL;

-- Make id NOT NULL after populating
ALTER TABLE public.users 
ALTER COLUMN id SET NOT NULL;

-- ============================================================================
-- 3. Update foreign key references to use UUID id
-- ============================================================================

-- Update invoices.company_id to reference companies.id (UUID)
DO $$
BEGIN
  -- Check if invoices table has company_id column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'invoices' 
    AND column_name = 'company_id'
  ) THEN
    -- Drop existing foreign key if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_schema = 'public' 
      AND constraint_name = 'invoices_company_id_fkey'
    ) THEN
      ALTER TABLE public.invoices DROP CONSTRAINT invoices_company_id_fkey;
    END IF;
    
    -- Add new foreign key to companies.id (UUID)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'companies' 
      AND column_name = 'id'
    ) THEN
      ALTER TABLE public.invoices 
      ADD CONSTRAINT invoices_company_id_fkey 
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Update customers.company_id to reference companies.id (UUID)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'customers' 
    AND column_name = 'company_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_schema = 'public' 
      AND constraint_name = 'customers_company_id_fkey'
    ) THEN
      ALTER TABLE public.customers DROP CONSTRAINT customers_company_id_fkey;
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'companies' 
      AND column_name = 'id'
    ) THEN
      ALTER TABLE public.customers 
      ADD CONSTRAINT customers_company_id_fkey 
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Update users.company_id to reference companies.id (UUID) if it's UUID type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'company_id'
  ) THEN
    -- Check if company_id is UUID type
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'users' 
      AND column_name = 'company_id'
      AND udt_name = 'uuid'
    ) THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND constraint_name = 'users_company_id_fkey'
      ) THEN
        ALTER TABLE public.users DROP CONSTRAINT users_company_id_fkey;
      END IF;
      
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'companies' 
        AND column_name = 'id'
      ) THEN
        ALTER TABLE public.users 
        ADD CONSTRAINT users_company_id_fkey 
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 4. Create indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS companies_id_idx ON public.companies(id);
CREATE INDEX IF NOT EXISTS users_id_idx ON public.users(id);
CREATE INDEX IF NOT EXISTS invoices_company_id_idx ON public.invoices(company_id);

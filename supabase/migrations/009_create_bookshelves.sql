-- ============================================================================
-- Bookshelves feature (Phase 5 / SaaS plan)
--
-- Adds three tables:
--   1. shelves          — manually curated, Goodreads-style ("Comfort reads")
--   2. shelf_works      — join table; a work can live on multiple shelves
--   3. smart_shelves    — saved filter queries that auto-populate
--
-- Free tier cap: 3 shelves TOTAL (manual + smart combined).
-- Enforcement: client-side for UX (nice errors, upgrade CTA) + a DB trigger
-- backstop here so the limit can't be bypassed via direct REST calls.
-- The existing 50-fic cap is only client-side because `works` is a shared
-- table with no user_id, which makes a DB trigger awkward. Shelves are
-- cheap to enforce DB-side because `shelves.user_id` exists directly,
-- so we do it.
-- ============================================================================

-- ---------- shelves (manual) ----------
CREATE TABLE IF NOT EXISTS public.shelves (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  color      text NOT NULL DEFAULT '#6366f1'
             CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX idx_shelves_user_id ON public.shelves(user_id);

-- ---------- shelf_works (join table) ----------
CREATE TABLE IF NOT EXISTS public.shelf_works (
  shelf_id uuid NOT NULL REFERENCES public.shelves(id) ON DELETE CASCADE,
  work_id  uuid NOT NULL REFERENCES public.works(id)   ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shelf_id, work_id)
);

-- Reverse-lookup index: "what shelves is this work on?" (work modal chips)
-- The PK covers (shelf_id, work_id) forward queries.
CREATE INDEX idx_shelf_works_work_id ON public.shelf_works(work_id);

-- ---------- smart_shelves (saved filters) ----------
CREATE TABLE IF NOT EXISTS public.smart_shelves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  filter_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX idx_smart_shelves_user_id ON public.smart_shelves(user_id);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.shelves       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shelf_works   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_shelves ENABLE ROW LEVEL SECURITY;

-- shelves: owner has full access
CREATE POLICY "shelves_owner_select" ON public.shelves
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "shelves_owner_insert" ON public.shelves
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shelves_owner_update" ON public.shelves
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shelves_owner_delete" ON public.shelves
  FOR DELETE USING (auth.uid() = user_id);

-- smart_shelves: same pattern
CREATE POLICY "smart_shelves_owner_select" ON public.smart_shelves
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "smart_shelves_owner_insert" ON public.smart_shelves
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "smart_shelves_owner_update" ON public.smart_shelves
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "smart_shelves_owner_delete" ON public.smart_shelves
  FOR DELETE USING (auth.uid() = user_id);

-- shelf_works: derived ownership via parent shelf.
-- Using EXISTS instead of denormalizing user_id onto the join row. Slightly
-- slower per-row but avoids update anomalies if a shelf ever changes hands.
CREATE POLICY "shelf_works_owner_select" ON public.shelf_works
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.shelves s
            WHERE s.id = shelf_works.shelf_id AND s.user_id = auth.uid())
  );
CREATE POLICY "shelf_works_owner_insert" ON public.shelf_works
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.shelves s
            WHERE s.id = shelf_works.shelf_id AND s.user_id = auth.uid())
  );
CREATE POLICY "shelf_works_owner_delete" ON public.shelf_works
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.shelves s
            WHERE s.id = shelf_works.shelf_id AND s.user_id = auth.uid())
  );
-- No UPDATE policy: shelf_works rows are immutable (delete + re-insert).

-- ============================================================================
-- Free-tier cap: combined 3 shelves (manual + smart) per user
-- Fires BEFORE INSERT on both tables. SECURITY DEFINER so it can read
-- user_preferences regardless of the caller's RLS context.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_shelf_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text;
  v_count integer;
BEGIN
  -- Look up the user's tier. Default to 'free' if no prefs row exists.
  SELECT COALESCE(subscription_tier, 'free')
    INTO v_tier
    FROM public.user_preferences
   WHERE user_id = NEW.user_id
   LIMIT 1;

  -- Plus and beta are unlimited. Beta == plus for gating purposes,
  -- matching the isPremium check in useLibrary.js.
  IF v_tier IN ('plus', 'beta') THEN
    RETURN NEW;
  END IF;

  -- Count combined shelves for this user
  SELECT (SELECT COUNT(*) FROM public.shelves       WHERE user_id = NEW.user_id)
       + (SELECT COUNT(*) FROM public.smart_shelves WHERE user_id = NEW.user_id)
    INTO v_count;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'BOOKSHELF_LIMIT_REACHED: free tier is limited to 3 shelves'
      USING ERRCODE = 'P0001',
            HINT = 'Upgrade to Plus for unlimited shelves';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_shelf_limit_on_shelves
  BEFORE INSERT ON public.shelves
  FOR EACH ROW EXECUTE FUNCTION public.enforce_shelf_limit();

CREATE TRIGGER enforce_shelf_limit_on_smart_shelves
  BEFORE INSERT ON public.smart_shelves
  FOR EACH ROW EXECUTE FUNCTION public.enforce_shelf_limit();

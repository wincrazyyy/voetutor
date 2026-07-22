/* ==========  LINK EXPIRY HARDENING  ==========
   (1) student_setup_tokens.consumed_at — hard single-use signal for /welcome setup links,
       stamped by the new consume_own_setup_tokens RPC when the student completes
       first-password setup; independent of the owner-clearable profiles.must_change_password
       flag. The /welcome route additionally enforces a 7-day age cap on every token.
   (2) class_invites — a 7-day hard cap on EVERY invite (including legacy NULL-expiry rows),
       enforced inside get_class_invite_preview and redeem_class_invite via
       LEAST(COALESCE(expires_at, created_at + 7 days), created_at + 7 days).
   Hand-authored (db diff is blocked by the redeem_class_invite %ROWTYPE forward-ref),
   mirroring supabase/schemas/01_functions.sql + 02_schema.sql — the source of truth. */

ALTER TABLE public.student_setup_tokens ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;

COMMENT ON TABLE public.student_setup_tokens IS 'Durable one-click setup links for educator-provisioned student accounts. createStudentAccountAction mints a row (service role) and hands the educator a /welcome/[token] URL; the /welcome route (service role, authorized by possession of the 192-bit secret in the URL) resolves the row, mints a FRESH short-lived Supabase recovery link at click time, and hands off to /auth/confirm, landing the student signed-in on /onboarding/set-password. Deliberately reusable until profiles.must_change_password flips FALSE (the everyday spent signal — a student who bails mid-flow can re-click), consumed_at is stamped (the hard single-use backstop, written by consume_own_setup_tokens on password completion), the row is revoked, or 7 days pass since created_at (a hard cap enforced in the /welcome route — no link outlives a week, no matter what). Students never read this table; the only authenticated surface is the issuer/admin select for a future manage or resend UI.';
COMMENT ON COLUMN public.student_setup_tokens.revoked_at IS 'Manual kill switch for a mis-sent link (service-role or admin write; no UI yet). The everyday expiry is NOT this column — it is profiles.must_change_password flipping FALSE plus the consumed_at hard-consume, and every token additionally hard-expires 7 days after created_at (enforced in the /welcome route).';
COMMENT ON COLUMN public.student_setup_tokens.consumed_at IS 'Stamped once the student completes first-password setup (via the consume_own_setup_tokens RPC called by the set-password form). Hard single-use signal, independent of the owner-clearable profiles.must_change_password flag; the /welcome route treats a non-NULL consumed_at as spent. Deliberately mutable — enforce_immutability_student_setup_tokens locks only id/created_at.';
COMMENT ON TABLE public.class_invites IS 'Single-use, per-student invite links for manual (off-platform payment) enrollment. An educator or admin generates a secret token URL for one class and hands it to the student manually; the student redeems it via the redeem_class_invite RPC, which enrols them bypassing the marketplace. Optional email binding, optional expiry hard-capped at 7 days from creation (the RPCs enforce LEAST(COALESCE(expires_at, created_at + 7 days), created_at + 7 days), so even legacy NULL-expiry rows die within a week), revocable via revoked_at. Students never touch this table directly — the anon-callable get_class_invite_preview RPC and the authenticated redeem_class_invite RPC are the only student-facing surfaces.';

CREATE OR REPLACE FUNCTION public.consume_own_setup_tokens()
RETURNS void AS $$
BEGIN
    UPDATE public.student_setup_tokens
    SET consumed_at = NOW()
    WHERE user_id = (SELECT auth.uid())
      AND consumed_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.consume_own_setup_tokens() IS 'Hard-consumes every outstanding setup link for the CALLER''s own account, called by the set-password form the moment first-password setup completes. Self-scoped by auth.uid() — a student can only spend their own tokens — and idempotent (only NULL consumed_at rows are stamped). Consuming ALL of the user''s tokens is deliberate: once they hold their own password, every setup link to that account must die. SECURITY DEFINER is required because student_setup_tokens has no authenticated write policy (writes are otherwise service-role only); this RPC is the single sanctioned, narrowly-scoped exception. Belt-and-braces alongside profiles.must_change_password: the /welcome route rejects a non-NULL consumed_at independently of the owner-clearable flag.';

REVOKE EXECUTE ON FUNCTION public.consume_own_setup_tokens() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.consume_own_setup_tokens() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_class_invite_preview(p_token TEXT)
RETURNS TABLE (class_id UUID, class_title TEXT, educator_name TEXT, redeemable BOOLEAN, reason TEXT, pass_name TEXT)
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.title,
        COALESCE(NULLIF(TRIM(COALESCE(pp.display_name, CONCAT_WS(' ', pp.first_name, pp.last_name))), ''), 'An educator'),
        (ci.revoked_at IS NULL
            AND ci.redeemed_at IS NULL
            AND LEAST(COALESCE(ci.expires_at, ci.created_at + INTERVAL '7 days'), ci.created_at + INTERVAL '7 days') > NOW()),
        CASE
            WHEN ci.revoked_at IS NOT NULL THEN 'revoked'
            WHEN ci.redeemed_at IS NOT NULL THEN 'redeemed'
            WHEN LEAST(COALESCE(ci.expires_at, ci.created_at + INTERVAL '7 days'), ci.created_at + INTERVAL '7 days') <= NOW() THEN 'expired'
            ELSE 'valid'
        END,
        cp.name
    FROM public.class_invites ci
    JOIN public.classes c ON c.id = ci.class_id
    LEFT JOIN public.profiles_public pp ON pp.id = c.educator_id
    LEFT JOIN public.class_passes cp ON cp.id = ci.pass_id
    WHERE ci.token = p_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.get_class_invite_preview(TEXT) IS 'Public (anon-callable) read boundary for the invite landing page: given the secret token, returns the class title, the educator''s display name, whether the invite is still redeemable (with a reason of revoked / redeemed / expired / valid), and the audience pass name (pass_name; NULL = full-access invite). Expiry is the effective expiry — LEAST(COALESCE(expires_at, created_at + 7 days), created_at + 7 days) — so every invite, including legacy rows created with no expiry, dies within 7 days of creation. Leaks nothing beyond the title + name + pass label — never email, note, or issuer — and returns zero rows for unknown tokens, so there is no existence oracle without holding the 192-bit secret. The pass name is the same trust surface as the class title (revealed only to secret-holders). SECURITY DEFINER with empty search_path; the WHERE clause and column list ARE the boundary, following the get_public_educator_profile pattern.';

REVOKE EXECUTE ON FUNCTION public.get_class_invite_preview(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_class_invite_preview(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.redeem_class_invite(p_token TEXT)
RETURNS UUID AS $$
DECLARE
    v_uid       UUID := (SELECT auth.uid());
    v_invite    public.class_invites%ROWTYPE;
    v_educator  UUID;
    v_caller_email TEXT;
    v_effective_expiry TIMESTAMPTZ;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH REQUIRED: Sign in to accept this invite.';
    END IF;

    SELECT * INTO v_invite FROM public.class_invites WHERE token = p_token FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This invite link is not valid.';
    END IF;
    IF v_invite.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'This invite has been revoked.';
    END IF;
    v_effective_expiry := LEAST(
        COALESCE(v_invite.expires_at, v_invite.created_at + INTERVAL '7 days'),
        v_invite.created_at + INTERVAL '7 days');
    IF v_effective_expiry <= NOW() THEN
        RAISE EXCEPTION 'This invite has expired.';
    END IF;

    /* Idempotent: the same user re-opening their already-redeemed link just lands in the class. */
    IF v_invite.redeemed_at IS NOT NULL THEN
        IF v_invite.redeemed_by = v_uid THEN
            IF v_invite.pass_id IS NOT NULL THEN
                INSERT INTO public.class_enrollments (user_id, class_id, access_scope)
                VALUES (v_uid, v_invite.class_id, 'scoped'::public.enrollment_access)
                ON CONFLICT (user_id, class_id) DO NOTHING;
                INSERT INTO public.class_pass_holders (user_id, class_id, pass_id, granted_by)
                VALUES (v_uid, v_invite.class_id, v_invite.pass_id, v_invite.created_by)
                ON CONFLICT (user_id, class_id, pass_id) DO NOTHING;
            ELSE
                INSERT INTO public.class_enrollments (user_id, class_id)
                VALUES (v_uid, v_invite.class_id)
                ON CONFLICT (user_id, class_id) DO UPDATE SET access_scope = 'full'::public.enrollment_access;
                DELETE FROM public.class_pass_holders
                WHERE user_id = v_uid AND class_id = v_invite.class_id;
            END IF;
            RETURN v_invite.class_id;
        END IF;
        RAISE EXCEPTION 'This invite has already been used.';
    END IF;

    /* Optional email binding. */
    IF v_invite.email IS NOT NULL THEN
        SELECT email INTO v_caller_email FROM auth.users WHERE id = v_uid;
        IF LOWER(v_caller_email) IS DISTINCT FROM LOWER(v_invite.email) THEN
            RAISE EXCEPTION 'This invite was issued for a different email address.';
        END IF;
    END IF;

    SELECT educator_id INTO v_educator FROM public.classes WHERE id = v_invite.class_id;
    IF v_educator = v_uid THEN
        RAISE EXCEPTION 'You teach this class — you cannot enrol as a student.';
    END IF;

    IF v_invite.pass_id IS NOT NULL THEN
        /* Scoped invite: enroll scoped; NEVER downgrade an existing enrollment. */
        INSERT INTO public.class_enrollments (user_id, class_id, access_scope)
        VALUES (v_uid, v_invite.class_id, 'scoped'::public.enrollment_access)
        ON CONFLICT (user_id, class_id) DO NOTHING;
        INSERT INTO public.class_pass_holders (user_id, class_id, pass_id, granted_by)
        VALUES (v_uid, v_invite.class_id, v_invite.pass_id, v_invite.created_by)
        ON CONFLICT (user_id, class_id, pass_id) DO NOTHING;
    ELSE
        /* Full invite: enroll full; UPGRADES an existing scoped enrollment (the invite is an
           explicit educator grant — this is the trial-to-paid manual upgrade path via link). */
        INSERT INTO public.class_enrollments (user_id, class_id)
        VALUES (v_uid, v_invite.class_id)
        ON CONFLICT (user_id, class_id) DO UPDATE SET access_scope = 'full'::public.enrollment_access;
        DELETE FROM public.class_pass_holders
        WHERE user_id = v_uid AND class_id = v_invite.class_id;
    END IF;

    UPDATE public.class_invites
    SET redeemed_by = v_uid, redeemed_at = NOW()
    WHERE id = v_invite.id;

    RETURN v_invite.class_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.redeem_class_invite(TEXT) IS 'The manual-payment enrollment writer. Validates the secret invite token (exists, not revoked, not past its effective expiry — LEAST(COALESCE(expires_at, created_at + 7 days), created_at + 7 days), so every invite, including legacy rows created with no expiry, dies within 7 days of creation), enforces single use (idempotent for the same caller — re-opening a redeemed link just re-lands them in the class; anyone else is rejected), honors the optional email binding against auth.users, and blocks the class educator from self-enrolling, then inserts the class_enrollments row and stamps redeemed_by / redeemed_at. Access Pass aware: a scoped invite (pass_id set) enrolls with access_scope = scoped and adds the class_pass_holders row, NEVER downgrading an existing enrollment (ON CONFLICT DO NOTHING); a full invite (pass_id NULL) enrolls full and UPGRADES an existing scoped enrollment in place (ON CONFLICT DO UPDATE), clearing the student''s holder rows — the deliberate trial-to-paid link upgrade path. The same branch applies on the idempotent same-redeemer re-open. SECURITY DEFINER bypasses the admin/educator-only insert policy on class_enrollments (the holder-row write is likewise sanctioned), exactly like enroll_in_free_class. Deliberately does NOT require is_published or price_cents = 0 — the invite is an explicit grant for an externally-paid (possibly draft) class. SELECT ... FOR UPDATE locks the invite row so two concurrent redeems cannot both win the single use. Returns the class_id for the post-join redirect.';

REVOKE EXECUTE ON FUNCTION public.redeem_class_invite(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.redeem_class_invite(TEXT) TO authenticated;

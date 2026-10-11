-- ============================================================================
-- MIGRATION: Save each performer's Glow and Grow for the teacher (issue #156)
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- Prereq: supabase_lesson_pass.sql, supabase_protect_pupil_data.sql,
--         supabase_submission_lock.sql.
-- Run it AFTER all three: it replaces pupil_save_submission and
-- pupil_get_submission from supabase_submission_lock.sql. If you re-run any of
-- them, re-run this file afterwards.
-- ----------------------------------------------------------------------------
-- What an assessor told the performer after ticking every cue (GLOSSARY.md:
-- Glow and Grow) is kept with that performer's peer ticks, as evidence for the
-- teacher. It never sets a level and the AI is never sent it (ADR 0001).
--
-- Running this late is safe: until it is run, the app saves everything except
-- the glow and grow (the older pupil_save_submission ignores the new key).
-- No new policy: the column sits behind the existing row rules, so pupil
-- devices still have no direct access to pair_submissions.
-- Read on the device by src/utils/glowGrow.ts (readPairGlowGrow).
-- ============================================================================

-- ── 1. Where it is kept ─────────────────────────────────────────────────────
alter table public.pair_submissions
  -- Each performer's glow and grow for their current attempt, keyed by the
  -- performer it was said TO:
  -- {"apple": {"glow": {"source": {"kind": "cue", "itemNumber": 2}, "text": "..."},
  --            "grow": {"source": {"kind": "own"}, "text": "..."}}, "banana": {...}}
  -- source.kind is 'cue' (with the cue's itemNumber), 'fixed' ("You gave it a
  -- go") or 'own' (the assessor's own idea, in their own words). The text is
  -- the wording the pupils saw, so a changed checklist never changes how an old
  -- one reads.
  add column if not exists glow_grow jsonb;

-- ── 2. Only what a glow and grow is made of is kept ─────────────────────────
-- Four small helpers for pupil_save_submission. They read nothing from the
-- database: they only tidy the JSON a device sent, and return null (never an
-- error) for anything that isn't the shape they expect.
--
-- One pick: where it came from and its wording, trimmed (spaces, tabs and line
-- breaks, as the app does) and cut to 200 characters. Null for anything else.
create or replace function public.glow_grow_pick(p jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when jsonb_typeof(p) is distinct from 'object'
      or jsonb_typeof(p->'text') is distinct from 'string'
      or s.txt = '' then null
    when p->'source'->>'kind' = 'cue' and jsonb_typeof(p->'source'->'itemNumber') = 'number' then
      jsonb_build_object(
        'source', jsonb_build_object('kind', 'cue', 'itemNumber', p->'source'->'itemNumber'),
        'text', left(s.txt, 200))
    when p->'source'->>'kind' in ('fixed', 'own') then
      jsonb_build_object(
        'source', jsonb_build_object('kind', p->'source'->>'kind'),
        'text', left(s.txt, 200))
  end
  from (select btrim(p->>'text', E' \t\n\r') as txt) s;
$$;

-- One performer's entry: a whole glow and grow, each a pick. Null for anything
-- else. Used for the entry kept with the current attempt and for the one kept
-- in a first-attempt snapshot.
create or replace function public.glow_grow_entry(p jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when public.glow_grow_pick(p->'glow') is not null and public.glow_grow_pick(p->'grow') is not null then
      jsonb_build_object(
        'glow', public.glow_grow_pick(p->'glow'),
        'grow', public.glow_grow_pick(p->'grow'))
  end;
$$;

-- What a device sent as glow_grow: only the apple and banana keys. Each is
-- that performer's entry, or JSON null, which asks for the stored entry to be
-- removed (the device sends it with ticks for an attempt that has no glow and
-- grow, so an earlier attempt's never stays under newer ticks). A key that is
-- absent, or holds anything else, is left out: that performer is left alone.
-- Null when nothing is left.
create or replace function public.clean_glow_grow(p jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_object_agg(k.performer, e.entry)
  from unnest(array['apple', 'banana']) as k(performer)
  cross join lateral (
    select case when jsonb_typeof(p->k.performer) = 'null' then 'null'::jsonb
                else public.glow_grow_entry(p->k.performer) end as entry
  ) e
  where e.entry is not null;
$$;

-- What a device sent as first_attempts: unchanged, except that a snapshot's
-- glowGrow gets the same cleaning as an entry above. One that fails is removed
-- from its snapshot; the rest of the snapshot is kept. Null unless an object.
create or replace function public.clean_first_attempts(p jsonb)
returns jsonb
language sql
immutable
as $$
  select case when jsonb_typeof(p) = 'object' then
    coalesce(
      (select jsonb_object_agg(
                a.key,
                case
                  when jsonb_typeof(a.value) is distinct from 'object' or not a.value ? 'glowGrow' then a.value
                  when public.glow_grow_entry(a.value->'glowGrow') is null then a.value - 'glowGrow'
                  else jsonb_set(a.value, '{glowGrow}', public.glow_grow_entry(a.value->'glowGrow'))
                end)
       from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) a),
      '{}'::jsonb)
  end;
$$;

-- ── 3. Pupil save: also keep each performer's glow and grow ─────────────────
-- Same as supabase_submission_lock.sql, plus glow_grow and the cleaning of a
-- first attempt's own glowGrow. Returns
-- 'ok' | 'claimed' | 'invalid_lesson' | 'locked'.
create or replace function public.pupil_save_submission(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      text := p->>'id';
  v_lesson  text := p->>'lesson_id';
  v_token   text := nullif(p->>'claim_token', '');
  v_pair    integer := (p->>'pair_number')::integer;
  v_teacher uuid;
  v_pairs   integer;
  v_prefix  text;
  v_photo   text := nullif(p->>'pair_photo', '');
  v_banana  text := nullif(p->>'banana_video_url', '');
  v_apple   text := nullif(p->>'apple_video_url', '');
  v_row     public.pair_submissions%rowtype;
  v_banana_cues jsonb := case when jsonb_typeof(p->'banana_cues') = 'array' and jsonb_array_length(p->'banana_cues') > 0
                              then p->'banana_cues' end;
  v_apple_cues  jsonb := case when jsonb_typeof(p->'apple_cues') = 'array' and jsonb_array_length(p->'apple_cues') > 0
                              then p->'apple_cues' end;
  v_ai_student jsonb := case when jsonb_typeof(p->'ai_student_feedback') = 'object' then p->'ai_student_feedback' end;
  v_ai_teacher jsonb := case when jsonb_typeof(p->'ai_teacher_report')   = 'object' then p->'ai_teacher_report' end;
  v_ai_chat    jsonb := case when jsonb_typeof(p->'ai_chat_analysis')    = 'object' then p->'ai_chat_analysis' end;
  -- Ignored unless an object; a snapshot's glowGrow is cleaned like an entry below (#156)
  v_first      jsonb := public.clean_first_attempts(p->'first_attempts');
  v_peer_steps jsonb := case when jsonb_typeof(p->'peer_steps')          = 'object' then p->'peer_steps' end;
  -- Ignored unless an object. Per performer: a whole entry, or JSON null to
  -- remove the stored one; an absent key leaves that performer alone (#156)
  v_glow_grow  jsonb := public.clean_glow_grow(p->'glow_grow');
  v_pupil      boolean;
  v_apple_new  boolean;  -- this write changes Apple's work
  v_banana_new boolean;  -- this write changes Banana's work
  v_any_locked boolean;
begin
  select teacher_id, pair_count into v_teacher, v_pairs
  from public.lessons
  where id = v_lesson
    and ((auth.uid() is not null and teacher_id = auth.uid())
         or (pupil_pass = p->>'pass' and lesson_date = public.sg_today()));

  if v_teacher is null
     or v_pair is null or v_pair not between 1 and v_pairs
     or v_id is null or v_id not like 'sub-' || v_lesson || '-p' || v_pair || '-%' then
    return 'invalid_lesson';
  end if;

  -- Only accept videos stored in this teacher's area and pair photos as images
  v_prefix := '/student-videos/' || v_teacher::text || '/pair_submissions/';
  if v_banana is not null and position(v_prefix in v_banana) = 0 then v_banana := null; end if;
  if v_apple  is not null and position(v_prefix in v_apple)  = 0 then v_apple  := null; end if;
  if v_photo  is not null and left(v_photo, 11) <> 'data:image/' then v_photo := null; end if;

  select * into v_row from public.pair_submissions where id = v_id;

  if found then
    if v_row.lesson_id <> v_lesson then
      return 'invalid_lesson';
    end if;
    if v_row.claim_token is not null and v_token is not null and v_row.claim_token <> v_token then
      return 'claimed';
    end if;

    -- Each performer's work is locked once sent, until the teacher asks for a
    -- redo. Unchanged values (a device re-sending what is already stored)
    -- don't count as changing it. The lesson's own teacher can always write.
    v_pupil := auth.uid() is null or auth.uid() <> v_teacher;
    v_apple_new :=
         (v_apple is not null and v_apple is distinct from v_row.apple_video_url)
      or (v_apple_cues is not null and v_apple_cues is distinct from v_row.apple_cues)
      or (v_ai_chat ? 'apple' and v_ai_chat->'apple' is distinct from v_row.ai_chat_analysis->'apple')
      or (v_first ? 'apple' and v_first->'apple' is distinct from v_row.first_attempts->'apple');
    v_banana_new :=
         (v_banana is not null and v_banana is distinct from v_row.banana_video_url)
      or (v_banana_cues is not null and v_banana_cues is distinct from v_row.banana_cues)
      or (v_ai_chat ? 'banana' and v_ai_chat->'banana' is distinct from v_row.ai_chat_analysis->'banana')
      or (v_first ? 'banana' and v_first->'banana' is distinct from v_row.first_attempts->'banana');
    if v_pupil and ((v_apple_new and public.performer_locked(v_row, 'apple'))
                 or (v_banana_new and public.performer_locked(v_row, 'banana'))) then
      return 'locked';
    end if;
    v_any_locked := public.performer_locked(v_row, 'apple') or public.performer_locked(v_row, 'banana');
    -- Step labels (#92) only change with the work: a locked performer's stays
    if v_pupil and v_peer_steps is not null then
      if public.performer_locked(v_row, 'apple')  then v_peer_steps := v_peer_steps - 'apple';  end if;
      if public.performer_locked(v_row, 'banana') then v_peer_steps := v_peer_steps - 'banana'; end if;
    end if;
    -- A glow and grow (#156) is locked with the performer's work. A locked
    -- performer's is dropped, not refused, whether it is an entry or a null
    -- asking to remove one: a device re-sends the whole record, and one whose
    -- entry was never stored (this file run mid-lesson) must still be able to
    -- save the other performer's work.
    if v_pupil and v_glow_grow is not null then
      if public.performer_locked(v_row, 'apple')  then v_glow_grow := v_glow_grow - 'apple';  end if;
      if public.performer_locked(v_row, 'banana') then v_glow_grow := v_glow_grow - 'banana'; end if;
      v_glow_grow := nullif(v_glow_grow, '{}'::jsonb);
    end if;

    update public.pair_submissions set
      skill_name          = coalesce(p->>'skill_name', skill_name),
      status              = coalesce(p->>'status', status),
      pair_photo          = coalesce(v_photo, pair_photo),
      banana_video_url    = coalesce(v_banana, banana_video_url),
      apple_video_url     = coalesce(v_apple, apple_video_url),
      banana_cues         = coalesce(v_banana_cues, banana_cues),
      apple_cues          = coalesce(v_apple_cues, apple_cues),
      -- The automatic peer feedback covers both performers, so a pupil can't
      -- replace it once either one's work is locked
      ai_student_feedback = case when v_pupil and v_any_locked then ai_student_feedback
                                 else coalesce(v_ai_student, ai_student_feedback) end,
      ai_teacher_report   = case when v_pupil and v_any_locked then ai_teacher_report
                                 else coalesce(v_ai_teacher, ai_teacher_report) end,
      -- Merged per performer, so sending one never drops the other's
      ai_chat_analysis    = case when v_ai_chat is null then ai_chat_analysis
                                 else coalesce(ai_chat_analysis, '{}'::jsonb) || v_ai_chat end,
      first_attempts      = case when v_first is null then first_attempts
                                 else coalesce(first_attempts, '{}'::jsonb) || v_first end,
      peer_steps          = case when v_peer_steps is null then peer_steps
                                 else coalesce(peer_steps, '{}'::jsonb) || v_peer_steps end,
      -- Merged per performer too; a null in what was sent removes that
      -- performer's entry (an entry itself never holds a null)
      glow_grow           = case when v_glow_grow is null then glow_grow
                                 else nullif(jsonb_strip_nulls(coalesce(glow_grow, '{}'::jsonb) || v_glow_grow), '{}'::jsonb) end,
      -- Sending a performer's analysis is what "sent" means (stamped here, not by the device)
      apple_sent_at       = case when v_ai_chat ? 'apple' and v_ai_chat->'apple' is distinct from ai_chat_analysis->'apple'
                                 then now() else apple_sent_at end,
      banana_sent_at      = case when v_ai_chat ? 'banana' and v_ai_chat->'banana' is distinct from ai_chat_analysis->'banana'
                                 then now() else banana_sent_at end,
      claim_token         = coalesce(v_token, claim_token),
      updated_at          = now()
    where id = v_id;
  else
    insert into public.pair_submissions
      (id, lesson_id, pair_number, skill_name, teacher_id, status, claim_token,
       pair_photo, banana_video_url, apple_video_url, banana_cues, apple_cues,
       ai_student_feedback, ai_teacher_report, ai_chat_analysis, first_attempts, peer_steps, glow_grow, apple_sent_at, banana_sent_at,
       created_at, updated_at)
    values
      (v_id, v_lesson, v_pair,
       coalesce(p->>'skill_name', 'Overhand Throw'),
       v_teacher,
       coalesce(p->>'status', 'pending_sync'),
       v_token, v_photo, v_banana, v_apple,
       coalesce(v_banana_cues, '[]'::jsonb),
       coalesce(v_apple_cues, '[]'::jsonb),
       v_ai_student, v_ai_teacher, v_ai_chat, v_first, v_peer_steps,
       nullif(jsonb_strip_nulls(v_glow_grow), '{}'::jsonb),  -- a null has nothing to remove on a new row
       case when v_ai_chat ? 'apple'  then now() end,
       case when v_ai_chat ? 'banana' then now() end,
       coalesce((p->>'created_at')::timestamptz, now()),
       now());
  end if;

  return 'ok';
exception
  when check_violation then -- PAIR_CLAIMED from trg_enforce_submission_claim
    return 'claimed';
end;
$$;

revoke all on function public.pupil_save_submission(jsonb) from public;
grant execute on function public.pupil_save_submission(jsonb) to anon, authenticated;

-- ── 4. Pupil read: also return the pair's own glow and grow ─────────────────
-- Same as supabase_submission_lock.sql, plus glow_grow, so "Our progress" can
-- show it from the teacher's copy. Still only for the pair holding the claim token.
create or replace function public.pupil_get_submission(p_id text, p_claim_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', id,
    'lesson_id', lesson_id,
    'pair_number', pair_number,
    'skill_name', skill_name,
    'status', status,
    'teacher_feedback', teacher_feedback,
    'teacher_star', teacher_star,
    'banana_cues', banana_cues,
    'apple_cues', apple_cues,
    'ai_student_feedback', ai_student_feedback,
    'ai_chat_analysis', ai_chat_analysis,  -- the pair's own sent analyses, for "Our work" (#94)
    'apple_video_url', apple_video_url,    -- so "Our work" knows a video was saved; not playable
    'banana_video_url', banana_video_url,  --   without the teacher's signed link (private bucket)
    'created_at', created_at,
    'redo_requested_at', redo_requested_at,
    'apple_sent_at', apple_sent_at,
    'banana_sent_at', banana_sent_at,
    'glow_grow', glow_grow                 -- what each assessor told the performer (#156)
  )
  from public.pair_submissions
  where id = p_id
    and claim_token is not null
    and claim_token = p_claim_token;
$$;

revoke all on function public.pupil_get_submission(text, text) from public;
grant execute on function public.pupil_get_submission(text, text) to anon, authenticated;

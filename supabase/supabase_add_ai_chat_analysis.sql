-- ============================================================================
-- MIGRATION: AI Chat Analysis submission (student → teacher review loop)
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- ============================================================================

-- Stores the AI "Performance Analysis / Checklist Assessment" chat response that
-- a student submits from the Practice Station for their teacher to review + comment on.
-- Shape: { analysisText: string, skillName: string, studentLabel: string, submittedAt: string }
alter table public.pair_submissions
  add column if not exists ai_chat_analysis jsonb;

ALTER TABLE public.announcements ADD COLUMN event_at TIMESTAMPTZ;
ALTER TABLE public.announcements
  ADD CONSTRAINT chk_announcement_event_at CHECK (event_at IS NULL OR type = 'event'::announcement_type);
COMMENT ON COLUMN public.announcements.event_at IS 'When the event happens (event-type announcements only — chk_announcement_event_at enforces NULL for standard/important). Stored as TIMESTAMPTZ; rendered in the viewer''s local timezone client-side.';

ALTER TABLE public.status_events
  ADD COLUMN IF NOT EXISTS dispatch_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'status_events_dispatch_status_check'
  ) THEN
    ALTER TABLE public.status_events
      ADD CONSTRAINT status_events_dispatch_status_check
      CHECK (dispatch_status IN ('pending', 'delivered', 'abandoned'));
  END IF;
END $$;

UPDATE public.status_events se
SET dispatch_status = 'delivered'
WHERE dispatch_status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.capi_delivery_logs l
    WHERE l.status_event_id = se.id AND l.delivered_at IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS status_events_dispatch_queue_idx
  ON public.status_events (dispatch_status, next_attempt_at);
-- Phase 7: a durable limiter for public links and inbound webhooks.  This is
-- deliberately provider-neutral: callers only persist a peppered subject hash.
CREATE TABLE public_rate_limit_buckets (
  scope varchar(80) NOT NULL,
  subject_hash varchar(64) NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, subject_hash, window_started_at)
);
CREATE INDEX public_rate_limit_expiry_idx ON public_rate_limit_buckets(window_started_at);

CREATE OR REPLACE FUNCTION consume_public_rate_limit(
  rate_scope varchar,
  rate_subject_hash varchar,
  max_attempts integer,
  window_seconds integer
) RETURNS boolean AS $$
DECLARE window_start timestamptz;
BEGIN
  IF max_attempts <= 0 OR window_seconds <= 0 THEN
    RAISE EXCEPTION 'rate-limit bounds must be positive';
  END IF;
  window_start := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / window_seconds) * window_seconds);
  INSERT INTO public_rate_limit_buckets (scope, subject_hash, window_started_at, attempts, updated_at)
  VALUES (rate_scope, rate_subject_hash, window_start, 1, clock_timestamp())
  ON CONFLICT (scope, subject_hash, window_started_at) DO UPDATE
    SET attempts = public_rate_limit_buckets.attempts + 1,
        updated_at = clock_timestamp()
    WHERE public_rate_limit_buckets.attempts < max_attempts;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- The app's database role performs the atomic function call; no client role
-- may enumerate or mutate counters directly.
REVOKE ALL ON public_rate_limit_buckets FROM PUBLIC;

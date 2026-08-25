ALTER TYPE intake_status ADD VALUE IF NOT EXISTS 'SETUP_IN_PROGRESS';

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS proposal_one_per_intake_unique
  ON proposals (intake_item_id)
  WHERE intake_item_id IS NOT NULL;

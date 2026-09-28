CREATE TABLE "membership_walkthroughs" (
  "membership_id" uuid PRIMARY KEY NOT NULL REFERENCES "memberships"("id") ON DELETE cascade,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "opted_out_at" timestamp with time zone,
  "resume_step_key" varchar(80),
  "resume_role" "membership_role",
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "membership_walkthrough_org_idx" ON "membership_walkthroughs" ("organization_id");
CREATE OR REPLACE FUNCTION guard_membership_walkthrough_org() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.id = NEW.membership_id AND m.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Membership and walkthrough organization mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER membership_walkthrough_org_guard BEFORE INSERT OR UPDATE ON membership_walkthroughs
  FOR EACH ROW EXECUTE FUNCTION guard_membership_walkthrough_org();
ALTER TABLE membership_walkthroughs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON membership_walkthroughs FROM anon, authenticated;

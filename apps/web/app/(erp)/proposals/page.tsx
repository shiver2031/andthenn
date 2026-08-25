import { permanentRedirect } from "next/navigation";

/** Kept for bookmarks and integrations; Intake is the canonical manager workspace. */
export default function ProposalsCompatibilityPage() {
  permanentRedirect("/intake?view=setups");
}

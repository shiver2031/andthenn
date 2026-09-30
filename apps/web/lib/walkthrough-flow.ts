import type { Role } from "@andthenn/domain";

export type WalkthroughTargetKey =
  | "brief" | "project" | "task" | "assignment" | "internalReview"
  | "clientReview" | "feedback" | "approval" | "finalDelivery" | "completed";

export type WalkthroughTargets = Record<WalkthroughTargetKey, string | null>;

export type WalkthroughStep = {
  key: string;
  title: string;
  body: string;
  href: string;
  selector: string;
  target?: WalkthroughTargetKey;
};

/** This order follows the role sections, task sections, and main workflow in CRM Flow.docx. */
export function walkthroughSteps(role: Role, financeAccess: boolean, targets: WalkthroughTargets): WalkthroughStep[] {
  const internal = role !== "CLIENT";
  const leader = role === "FOUNDER" || role === "MANAGER";
  const step = (key: string, title: string, body: string, href: string, selector: string, target?: WalkthroughTargetKey): WalkthroughStep => ({ key, title, body, href, selector, ...(target ? { target } : {}) });
  const at = (key: WalkthroughTargetKey) => targets[key] ?? "/home";
  return [
    step("home", `${role[0]}${role.slice(1).toLowerCase()} Home`, role === "FOUNDER" ? "See the company, deadlines, risks, approvals, team and accounts from one place." : role === "MANAGER" ? "Start with today's briefs, tasks, client feedback, approvals and team workload." : role === "DESIGNER" ? "Start with assigned work, deadlines, feedback and review status." : "See only the projects, reviews and final files shared with you.", "/home", "[data-walkthrough='home']"),
    ...(internal ? [
      step("attention", "Needs Attention", "Review overdue, due, high-priority, blocked, waiting, approval and mention items that need your response.", "/home", "[data-walkthrough='attention']"),
      step("my-tasks", "My Tasks", "Each task shows its assigner, assignment date, due date, priority, project, status and notes.", "/work?view=mine", "[data-walkthrough='my-tasks']"),
      step("assigned-by-me", "Assigned by Me", "Follow the tasks you gave teammates and their progress.", "/work?view=assigned", "[data-walkthrough='assigned-by-me']"),
      step("notifications", "Mentions and notifications", "Task assignments and @mentions create notifications that open the related work.", "/notifications", "[data-walkthrough='notifications']"),
    ] : []),
    ...(leader ? [step("team", "Team", "See who is working on what, availability, load and overdue work.", "/team", "[data-walkthrough='team']")] : []),
    ...(role === "FOUNDER" || (role === "MANAGER" && financeAccess) ? [step("accounts", "Accounts", "Review permitted revenue, expenses, estimates, invoices and profit information.", "/accounts", "#main-content")] : []),
    ...(leader ? [step("brief", "Brief", "Capture and decide on a new brief before project setup.", at("brief"), "[data-walkthrough='brief']", "brief")] : []),
    step("project", "Project", role === "CLIENT" ? "Open a project shared with your client account." : "The approved brief becomes a project with its outputs, people and deadlines.", at("project"), "[data-walkthrough='project']", "project"),
    ...(internal ? [
      step("tasks", "Tasks", "Break project outputs into trackable tasks with a primary owner.", at("project").replace("#overview", "#tasks"), "[data-walkthrough='tasks']", "task"),
      step("assign", "Assign People", "Any internal teammate may assign project work to any active internal teammate.", at("assignment"), "[data-walkthrough='assign']", "assignment"),
      step("work", "Work", "The assignee updates Open, In Progress, Waiting or Blocked and requests completion when ready.", at("task"), "[data-walkthrough='work']", "task"),
      step("internal-review", "Internal Review", "Select an exact version, discuss changes and clear it before Client review.", at("internalReview"), "[data-walkthrough='internal-review']", "internalReview"),
    ] : []),
    step("client-review", "Client Review", role === "CLIENT" ? "Review the exact version shared with your account." : "Send a version-pinned share for Client review after internal clearance.", at("clientReview"), "[data-walkthrough='client-review']", "clientReview"),
    step("feedback", "Feedback / Changes", role === "CLIENT" ? "Request changes and explain your feedback on the shared version." : "Record feedback, discuss revisions and submit a new version when changes are needed.", at("feedback"), role === "CLIENT" ? "#client-decisions" : "[data-walkthrough='feedback']", "feedback"),
    step("approval", "Approval", role === "CLIENT" ? "Approve the exact shared version when it is ready." : leader ? "Confirm explicit Client approval before publication." : "Track Client approval of the exact version before delivery.", at("approval"), role === "CLIENT" ? "#client-decisions" : leader ? "[data-walkthrough='approval']" : "#review", "approval"),
    step("final-delivery", "Final Delivery", role === "CLIENT" ? "Open only the approved final files that were explicitly published." : "Publish the Client-approved version as the final delivery.", at("finalDelivery"), "[data-walkthrough='final-delivery']", "finalDelivery"),
    step("completed", "Completed", role === "CLIENT" ? "See the completed project and its published files." : "Confirm completed tasks and outputs, verify the archive, then close the project.", at("completed"), "#overview", "completed"),
  ];
}

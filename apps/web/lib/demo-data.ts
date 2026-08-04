export const projects = [
  { id: "aster", code: "AT-042", name: "Aster House — Monsoon Stories", client: "Aster House", owner: "Maya", due: "12 Aug", progress: 68, health: "On track", tone: "green" },
  { id: "juniper", code: "AT-039", name: "Juniper — Founder Film", client: "Juniper Labs", owner: "Arjun", due: "08 Aug", progress: 82, health: "At risk", tone: "amber" },
  { id: "one8", code: "AT-044", name: "One8 — Matchday Social", client: "One8", owner: "Diya", due: "16 Aug", progress: 41, health: "On track", tone: "green" },
];

export const intakeItems = [
  { id: "IN-108", source: "WhatsApp", sender: "Rhea · Aster House", subject: "Monsoon launch — cutdowns + stories", preview: "Hey team, attaching the revised brief and voice note…", received: "12m", confidence: 92, priority: "High", claimed: "You", selected: true },
  { id: "IN-107", source: "Email", sender: "Karan · Juniper Labs", subject: "Founder film feedback — round 2", preview: "Please find the timestamped notes from today's internal review…", received: "34m", confidence: 88, priority: "Normal", claimed: "Arjun" },
  { id: "IN-106", source: "Manual", sender: "Maya Shah", subject: "New pitch: Northstar Hotels", preview: "Call notes and initial deliverable thoughts from the lead…", received: "1h", confidence: 64, priority: "Normal", claimed: null },
  { id: "IN-105", source: "Email", sender: "Meera · One8", subject: "Weekend matchday request", preview: "We need 6 responsive story layouts and match clips…", received: "2h", confidence: 95, priority: "High", claimed: "Diya" },
];

export const stages = [
  { id: "brief", label: "Briefing", color: "#8b5cf6", tasks: [{ title: "Lock messaging hierarchy", owner: "MS", due: "Today", tag: "Strategy" }] },
  { id: "production", label: "In production", color: "#06b6d4", tasks: [{ title: "Hero film — edit V2", owner: "AK", due: "Today", tag: "Video" }, { title: "Story cutdowns × 6", owner: "ND", due: "Tomorrow", tag: "Design" }, { title: "Sound mix and master", owner: "RJ", due: "10 Aug", tag: "Audio" }] },
  { id: "review", label: "Client review", color: "#f59e0b", tasks: [{ title: "Campaign key visual", owner: "ND", due: "8 Aug", tag: "Design" }] },
  { id: "complete", label: "Completed", color: "#10b981", tasks: [{ title: "Location recce", owner: "AK", due: "Done", tag: "Production" }] },
];

export const people = [
  { initials: "MS", name: "Maya Shah", role: "Project owner", load: 71, capacity: 40, scheduled: 28.5, tone: "violet" },
  { initials: "AK", name: "Arjun Kumar", role: "Video lead", load: 93, capacity: 40, scheduled: 37.2, tone: "amber" },
  { initials: "ND", name: "Naina D'Souza", role: "Designer", load: 64, capacity: 40, scheduled: 25.6, tone: "cyan" },
  { initials: "RJ", name: "Rohan Jain", role: "Sound", load: 48, capacity: 24, scheduled: 11.5, tone: "green" },
];

export const notifications = [
  { title: "Client feedback on Hero Film V2", detail: "Rhea left 3 timestamped comments", time: "8m", unread: true },
  { title: "AT-039 deadline risk", detail: "2 tasks are likely to miss the 8 Aug due date", time: "25m", unread: true },
  { title: "Proposal approved", detail: "Aster House approved Monsoon Stories", time: "1h", unread: false },
  { title: "Archive completed", detail: "Juniper Q2 Social was archived successfully", time: "Yesterday", unread: false },
];

# AndThenn manual end-to-end guide

Use this checklist against a production build. Record **Pass**, **Fail**, or **Blocked** for every numbered check and attach a screenshot for each failure. A control passes only when it produces a visible state change, opens a usable surface, downloads a file, or navigates to the correct record. A click with no observable result is a failure.

## 1. Start-up and authentication

1. Run `pnpm check`, then `pnpm --filter @andthenn/web build`.
2. Start the standalone build with `PORT=3000 node apps/web/.next/standalone/apps/web/server.js`.
3. Open `http://localhost:3000`. Confirm it redirects to `/home`, the page has no console errors, and there is no horizontal scroll.
4. Open `/login`. Activate **Continue with Google Workspace** and confirm an authentication flow begins.
5. Return to `/login`. Activate **Temporary collaborator sign in** and confirm a credential flow begins.

## 2. Global shell and manager home

1. From `/home`, activate every sidebar link and confirm the URL, page heading, and active navigation state match.
2. Open global search, enter `Hero film`, select the task result, and confirm navigation to the matching task. Repeat with one project and one client.
3. Confirm global search closes with its close button and with Escape.
4. Activate **New**, **Help & support**, and the profile control. Confirm each opens the expected menu or workflow.
5. Open each item in **Project pulse** and **Control room**. Confirm it opens the named record rather than a generic page.

## 3. Intake

1. Open `/intake?view=queue`; select each inbox item and confirm its source evidence, owner, and summary update.
2. Claim an unowned item, confirm the owner changes to you, release it, and confirm it becomes unclaimed.
3. Use **Manual intake**, create a request, reload the page, and confirm it persists.
4. Select **Approve & set up**, complete the project, work/team, and confirmation steps, then confirm the resulting project appears exactly once.
5. Open `/intake?view=setups`, resume an intake-backed and a manager-created setup, then close each and confirm its draft remains available.
6. Open `/intake?view=history`; confirm approved setups link to the created project and rejected setups retain their reason.

## 4. Projects and tasks

1. Open `/proposals` and confirm it redirects to `/intake?view=setups`.
2. On `/projects`, search for `Juniper`; confirm nonmatching projects disappear. Create a project and confirm it persists after reload.
3. Open `/projects/aster` and `/projects/juniper`; confirm each URL shows its own project data.
4. On a project, toggle **Board** and **List**, then test **Overview**, **Files**, **Commercial**, and **Timeline**.
5. Exercise **Team**, **More project actions**, **Due date**, **Assignee**, **Search tasks**, and **Add task**. Confirm each changes the intended record or opens a usable control.
6. Open `/tasks/hero-film`; change assignment and status, move it to client review, upload a new version, and post an internal comment. Reload and confirm all changes persist.
7. Complete and reopen a deliverable and project; verify the required manager/client confirmation and audit history.

## 5. Clients, commercials, workload, and operations

1. On `/clients`, search for `Juniper`; confirm `Aster` disappears. Create a client, brand, contact, and dated rate-card entry, then reload.
2. On `/commercial`, create and version a GST quotation, override a rate with a reason, export it, and update invoice status.
3. On `/workload`, move to the next/previous week, filter the grid, open a populated cell to its source task/time entries, and export.
4. On `/reports`, change a filter and export CSV. Check the file contents match the visible report.
5. On `/notifications`, open a notification and use **Mark all read**. Reload and confirm the read state persists.
6. On `/admin`, invite a permanent and a temporary user; test **People & permissions**, **Integrations**, and **Security & retention**.

## 6. Public review

1. Open `/review/demo-token` in a private browser window. Confirm no login is required and that the page identifies the correct project, deliverable, and pinned version.
2. Play and pause the asset. Select every comment marker and confirm the matching thread is highlighted.
3. Submit a timecoded comment with reviewer name and email. Reload and confirm it persists on the same version.
4. Test **Draw on frame**, **Copy share link**, **Download version**, **More**, **Fullscreen**, and the reviewer-identity control.
5. Repeat the review flow with video, audio, image, and PDF versions. Confirm an expired or revoked link does not expose the asset.
6. On a 375×812 viewport, open the comments drawer, submit feedback, close it, and confirm playback remains usable.

## 7. Responsive, accessibility, and recovery gates

1. Repeat all route opens at widths 375, 768, 1024, and 1440. No page may overflow horizontally or hide a required action.
2. Complete the primary flows using only the keyboard. Confirm focus order and focus visibility.
3. Repeat with reduced motion enabled and with a screen reader; confirm controls have meaningful names and status changes are announced.
4. Test Gmail, WhatsApp, and storage provider retry/recovery with sandbox credentials.
5. Restore a production-like backup and confirm the app, files, audit events, and review links recover consistently.

## 8. Release acceptance

A release passes only when every implemented control above passes, all twelve PRD acceptance scenarios pass end to end, and every environment-dependent gate has credential-backed evidence. “Page renders,” mocked/static data, or a unit-tested domain function does not substitute for a working user workflow.

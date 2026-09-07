import type postgres from "postgres";

/** One-time repair of known demo identities only. Never infer roles from user-created data. */
export async function migratePrototypePersonas(sql: postgres.Sql) {
  const org = "20000000-0000-4000-8000-000000000001";
  await sql.begin(async (tx) => {
    const [known] = await tx`select id from organizations where id=${org} and slug='andthenn-media' for update`;
    if (!known) return;
    await tx`create table if not exists prototype_data_migrations (key text primary key, applied_at timestamptz not null default now())`;
    const [done] = await tx`select key from prototype_data_migrations where key='crm-personas-v2'`;
    if (done) return;
    for (const suffix of ["002", "003", "004", "005"]) {
      await tx`update memberships m set role='DESIGNER' from profiles p
        where m.id=${`22000000-0000-4000-8000-000000000${suffix}`} and m.organization_id=${org}
        and m.profile_id=p.id and p.auth_user_id=${`10000000-0000-4000-8000-000000000${suffix}`}
        and m.role::text in ('EMPLOYEE','TEMP_FREELANCER')`;
    }
    for (const person of [
      { suffix: "006", name: "Rohan Bose", email: "rohan@andthenn.example", role: "MANAGER" },
      { suffix: "007", name: "Riya Malhotra", email: "riya@aster.example", role: "CLIENT" },
      { suffix: "008", name: "Dev Khanna", email: "dev@juniper.example", role: "CLIENT" },
    ]) {
      const profile = `21000000-0000-4000-8000-000000000${person.suffix}`, member = `22000000-0000-4000-8000-000000000${person.suffix}`, auth = `10000000-0000-4000-8000-000000000${person.suffix}`;
      await tx`insert into profiles (id, auth_user_id, display_name, email) values (${profile}, ${auth}, ${person.name}, ${person.email}) on conflict do nothing`;
      await tx`insert into memberships (id, organization_id, profile_id, role, account_type, status)
        select ${member}, ${org}, id, ${person.role}::membership_role, 'PERMANENT', 'ACTIVE' from profiles
        where id=${profile} and auth_user_id=${auth} and email=${person.email} on conflict do nothing`;
      if (person.role === "CLIENT") {
        const client = person.suffix === "007" ? "23000000-0000-4000-8000-000000000001" : "23000000-0000-4000-8000-000000000003";
        await tx`insert into client_memberships (organization_id, client_id, membership_id)
          select ${org}, c.id, m.id from clients c, memberships m where c.id=${client} and c.organization_id=${org}
          and m.id=${member} and m.organization_id=${org} and m.profile_id=${profile} and m.role='CLIENT' on conflict do nothing`;
      } else {
        await tx`insert into capacity_schedules (organization_id, membership_id, effective_from, weekly_minutes)
          select ${org}, id, current_date, 2400 from memberships where id=${member} and organization_id=${org}
          and not exists (select 1 from capacity_schedules where membership_id=${member}) on conflict do nothing`;
      }
    }
    // Existing task ownership, project memberships, dates, and user records survive.
    await tx`update memberships m set role='FOUNDER', finance_access=true from profiles p
      where m.id='22000000-0000-4000-8000-000000000001' and m.organization_id=${org}
      and m.profile_id=p.id and p.auth_user_id='10000000-0000-4000-8000-000000000001'
      and p.email='mira@andthenn.example' and m.role='MANAGER'`;
    await tx`insert into prototype_data_migrations (key) values ('crm-personas-v2')`;
  });
}

"use client";

import {
  ChevronDown,
  MailPlus,
  MoreHorizontal,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { useEffect, useMemo, useRef, useState } from "react";

import { useMembers, useRemoveMember, useUpdateMemberRole } from "@/hooks/use-members";
import {
  useCreateInvitation,
  useInvitations,
  useRevokeInvitation,
} from "@/hooks/use-invitations";
import { ApiError } from "@/lib/api/client";
import type { WorkspaceRole } from "@/lib/api/workspace";

type MemberRole = "Owner" | "Admin" | "Member" | "Viewer";

type Row = {
  id: string;
  kind: "member" | "invitation";
  userId?: string;
  name: string;
  email: string;
  role: MemberRole;
  status: "Active" | "Pending";
  joined: string;
  isSelf: boolean;
};

const ROLE_TITLE: Record<WorkspaceRole, MemberRole> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};
const ROLE_SLUG: Record<MemberRole, WorkspaceRole> = {
  Owner: "owner",
  Admin: "admin",
  Member: "member",
  Viewer: "viewer",
};

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
}

export function MembersSettings() {
  const membersQuery = useMembers();
  const invitationsQuery = useInvitations();

  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const createInvitation = useCreateInvitation();
  const revokeInvitation = useRevokeInvitation();

  const [roleFilter, setRoleFilter] = useState("All roles");
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("Member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const myRole = membersQuery.data?.find((m) => m.isSelf)?.role;
  const canManage = myRole === "owner" || myRole === "admin";

  const rows: Row[] = useMemo(() => {
    const members: Row[] = (membersQuery.data ?? []).map((m) => ({
      id: `m-${m.userId}`,
      kind: "member",
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: ROLE_TITLE[m.role],
      status: "Active",
      joined: formatDate(m.joinedAt),
      isSelf: m.isSelf,
    }));
    const invites: Row[] = (invitationsQuery.data ?? []).map((i) => ({
      id: `i-${i.id}`,
      kind: "invitation",
      name: i.email,
      email: i.email,
      role: ROLE_TITLE[(i.role as WorkspaceRole) ?? "member"] ?? "Member",
      status: "Pending",
      joined: formatDate(i.createdAt),
      isSelf: false,
    }));
    return [...members, ...invites];
  }, [membersQuery.data, invitationsQuery.data]);

  const filteredRows = rows.filter((row) => {
    const matchesRole = roleFilter === "All roles" || row.role === roleFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      row.name.toLowerCase().includes(q) ||
      row.email.toLowerCase().includes(q);
    return matchesRole && matchesSearch;
  });

  function handleInvite() {
    setActionError(null);
    setInviteLink(null);
    createInvitation.mutate(
      { email: inviteEmail.trim(), role: ROLE_SLUG[inviteRole] },
      {
        onSuccess: (invite) => {
          setInviteEmail("");
          if (invite.token) {
            const url = `${window.location.origin}/invite?token=${invite.token}`;
            setInviteLink(url);
          }
        },
        onError: (error) => {
          setActionError(
            error instanceof ApiError
              ? error.message
              : "Could not send the invitation.",
          );
        },
      },
    );
  }

  const loadError = membersQuery.isError
    ? "Could not load members."
    : invitationsQuery.isError
      ? "Could not load pending invitations."
      : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-semibold text-slate-800">
              Members
            </h2>

            <p className="mt-1 text-[9px] text-slate-400">
              Manage who can access this workspace and what they can do.
            </p>
          </div>

          <button
            type="button"
            onClick={() => canManage && setInviteOpen((v) => !v)}
            disabled={!canManage}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <MailPlus className="h-3.5 w-3.5" />
            Invite member
          </button>
        </div>

        {inviteOpen && canManage && (
          <div className="flex flex-col gap-2.5 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex h-8 flex-1 items-center gap-2 rounded-md border border-slate-200 px-2.5">
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="teammate@example.com"
                className="min-w-0 flex-1 bg-transparent text-[10px] text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <select
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(event.target.value as MemberRole)
              }
              className="h-8 appearance-none rounded-md border border-slate-200 bg-white pl-2.5 pr-7 text-[10px] font-medium text-slate-600 outline-none focus:border-blue-400"
            >
              <option>Admin</option>
              <option>Member</option>
              <option>Viewer</option>
            </select>

            <button
              type="button"
              onClick={handleInvite}
              disabled={createInvitation.isPending || !inviteEmail.trim()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createInvitation.isPending ? "Sending…" : "Send invite"}
            </button>
          </div>
        )}

        {inviteLink && (
          <div className="border-b border-slate-200 px-4 py-2.5 text-[9px] text-slate-500">
            Invitation created. Share this link with the invitee:{" "}
            <span className="break-all font-mono text-slate-700">
              {inviteLink}
            </span>
          </div>
        )}

        {(actionError || loadError) && (
          <div className="border-b border-slate-200 px-4 py-2.5 text-[9px] font-medium text-red-500">
            {actionError || loadError}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col gap-2.5 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-[240px] items-center gap-2 rounded-md border border-slate-200 px-2.5">
              <Search className="h-3.5 w-3.5 text-slate-400" />

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search members..."
                className="min-w-0 flex-1 bg-transparent text-[10px] text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="relative">
              <select
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value)
                }
                className="h-8 appearance-none rounded-md border border-slate-200 bg-white pl-2.5 pr-7 text-[10px] font-medium text-slate-600 outline-none focus:border-blue-400"
              >
                <option>All roles</option>
                <option>Owner</option>
                <option>Admin</option>
                <option>Member</option>
                <option>Viewer</option>
              </select>

              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <span className="text-[9px] text-slate-400">
            {membersQuery.isLoading
              ? "Loading…"
              : `${filteredRows.length} members`}
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th className="px-4 py-2.5 text-left text-[8px] font-semibold tracking-[0.08em] text-slate-400">
                  MEMBER
                </th>

                <th className="px-4 py-2.5 text-left text-[8px] font-semibold tracking-[0.08em] text-slate-400">
                  ROLE
                </th>

                <th className="px-4 py-2.5 text-left text-[8px] font-semibold tracking-[0.08em] text-slate-400">
                  STATUS
                </th>

                <th className="px-4 py-2.5 text-left text-[8px] font-semibold tracking-[0.08em] text-slate-400">
                  JOINED
                </th>

                <th className="w-[60px]" />
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((row) => (
                <MemberRow
                  key={row.id}
                  row={row}
                  canManage={canManage}
                  busy={updateRole.isPending || removeMember.isPending}
                  onChangeRole={(role) => {
                    if (!row.userId) return;
                    setActionError(null);
                    updateRole.mutate(
                      { userId: row.userId, role: ROLE_SLUG[role] },
                      {
                        onError: (error) =>
                          setActionError(
                            error instanceof ApiError
                              ? error.message
                              : "Could not update the role.",
                          ),
                      },
                    );
                  }}
                  onRemove={() => {
                    setActionError(null);
                    if (row.kind === "invitation") {
                      revokeInvitation.mutate(row.id.replace(/^i-/, ""), {
                        onError: (error) =>
                          setActionError(
                            error instanceof ApiError
                              ? error.message
                              : "Could not revoke the invitation.",
                          ),
                      });
                      return;
                    }
                    if (!row.userId) return;
                    removeMember.mutate(row.userId, {
                      onError: (error) =>
                        setActionError(
                          error instanceof ApiError
                            ? error.message
                            : "Could not remove the member.",
                        ),
                    });
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Roles */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-slate-800">
            Workspace roles
          </h2>

          <p className="mt-1 text-[9px] text-slate-400">
            Understand the permissions available to each role.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          <RoleDescription
            role="Owner"
            description="Full access to workspace settings, members, workflows, and billing."
          />

          <RoleDescription
            role="Admin"
            description="Manage members, workflows, integrations, and workspace settings."
          />

          <RoleDescription
            role="Member"
            description="Create and manage workflows and access workspace resources."
          />

          <RoleDescription
            role="Viewer"
            description="View workflows and executions without making changes."
          />
        </div>
      </section>
    </div>
  );
}

function MemberRow({
  row,
  canManage,
  busy,
  onChangeRole,
  onRemove,
}: {
  row: Row;
  canManage: boolean;
  busy: boolean;
  onChangeRole: (role: MemberRole) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLTableCellElement | null>(null);

  useEffect(() => {
    function handle(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const showActions = canManage && !row.isSelf;

  return (
    <tr className="group border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500">
            <UserRound className="h-3.5 w-3.5" />
          </div>

          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold text-slate-700">
              {row.name}
            </p>

            <p className="mt-0.5 truncate text-[8px] text-slate-400">
              {row.email}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <RoleBadge role={row.role} />
      </td>

      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>

      <td className="px-4 py-3 text-[9px] text-slate-400">
        {row.joined}
      </td>

      <td ref={menuRef} className="relative px-3 py-3 text-right">
        <button
          type="button"
          aria-label={`Actions for ${row.name}`}
          onClick={() => showActions && setOpen((v) => !v)}
          disabled={!showActions || busy}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 disabled:cursor-not-allowed"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {open && showActions && (
          <div className="absolute right-2 top-full z-30 mt-1 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-lg">
            {row.kind === "member" && (
              <div className="py-1">
                {(["Owner", "Admin", "Member", "Viewer"] as MemberRole[]).map(
                  (r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        if (r !== row.role) onChangeRole(r);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-[10px] text-slate-700 hover:bg-slate-50"
                    >
                      {r === row.role ? `${r} (current)` : `Make ${r}`}
                    </button>
                  ),
                )}
                <div className="border-t border-slate-200" />
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
              className="block w-full px-3 py-1.5 text-left text-[10px] text-red-600 hover:bg-red-50"
            >
              {row.kind === "invitation" ? "Revoke invite" : "Remove member"}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function RoleBadge({
  role,
}: {
  role: MemberRole;
}) {
  const classes = {
    Owner:
      "border-violet-200 bg-violet-50 text-violet-600",
    Admin:
      "border-blue-200 bg-blue-50 text-blue-600",
    Member:
      "border-slate-200 bg-slate-50 text-slate-500",
    Viewer:
      "border-slate-200 bg-white text-slate-400",
  };

  return (
    <span
      className={`rounded-full border px-2 py-1 text-[8px] font-semibold ${classes[role]}`}
    >
      {role}
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: "Active" | "Pending";
}) {
  if (status === "Pending") {
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[8px] font-semibold text-amber-600">
        Pending
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[8px] font-semibold text-emerald-600">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Active
    </span>
  );
}

function RoleDescription({
  role,
  description,
}: {
  role: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5" />
      </div>

      <div>
        <p className="text-[10px] font-semibold text-slate-700">
          {role}
        </p>

        <p className="mt-0.5 text-[9px] leading-4 text-slate-400">
          {description}
        </p>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { searchClients } from "@/lib/services/search";
import { formatINR } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { Badge, EmptyState, Page, PageHeader, Table, Td, Th } from "@/components/ui";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q = "" } = await searchParams;
  const clients = await searchClients(user.orgId, q);

  return (
    <Page wide>
      <PageHeader
        title="Clients & Vehicles"
        subtitle={`${clients.length} ${clients.length === 1 ? "client" : "clients"}${q ? ` matching “${q}”` : ""}`}
        backHref="/dashboard"
        actions={
          <Link href="/clients/new" className="btn btn-primary">
            <Plus size={16} />
            New client
          </Link>
        }
      />

      {/* Plain GET form: the search term lives in the URL, so a result list is
          shareable and the back button behaves the way staff expect. */}
      <form method="get" className="mb-4 relative max-w-md">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--text-subtle)" }}
        />
        <input
          name="q"
          defaultValue={q}
          className="input pl-9"
          placeholder="Search by name or phone number"
          autoComplete="off"
        />
      </form>

      {clients.length === 0 ? (
        <div className="card">
          <EmptyState
            title={q ? "No clients match that search" : "No clients yet"}
            description={
              q
                ? "Try a phone number, or part of the name."
                : "Add your first client, or let the job card screen create one from a plate search."
            }
            action={
              <Link href="/clients/new" className="btn btn-primary">
                <Plus size={16} />
                New client
              </Link>
            }
          />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Client</Th>
              <Th>Phone</Th>
              <Th align="center">Vehicles</Th>
              <Th align="right">Outstanding</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t">
                <Td>
                  <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  {c.type === "CORPORATE" && (
                    <span className="ml-2">
                      <Badge tone="brand">Corporate</Badge>
                    </span>
                  )}
                  {c.email && (
                    <div className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                      {c.email}
                    </div>
                  )}
                </Td>
                <Td muted nowrap>
                  <span className="tnum">{formatPhone(c.phone)}</span>
                </Td>
                <Td align="center" muted>
                  {c.vehicleCount}
                </Td>
                <Td align="right">
                  <span
                    className="tnum font-medium"
                    style={{ color: c.outstandingMinor > 0 ? "var(--warning)" : "var(--text-subtle)" }}
                  >
                    {c.outstandingMinor > 0 ? formatINR(c.outstandingMinor) : "—"}
                  </span>
                </Td>
                <Td align="right">
                  <Link
                    href={`/clients/${c.id}`}
                    className="text-[12.5px] font-medium"
                    style={{ color: "var(--brand)" }}
                  >
                    Open
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Page>
  );
}

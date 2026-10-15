import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily revenue, inventory and capacity for the case scope (evidence drill-down charts). */
export async function GET(_req: Request, ctx: RouteContext<"/api/decisions/[id]/series">) {
  if (!(await getSession())) return new Response("Not signed in", { status: 401 });
  const { id } = await ctx.params;
  const sql = db();
  const [c] = await sql`select category_id, store_ids, data_as_of from decision_cases where decision_id = ${id}`;
  if (!c) return new Response("Not found", { status: 404 });
  const sales = await sql`
    select date::text, round(sum(store_sales))::float as store, round(sum(ecommerce_sales))::float as ecom, max(promo_flag)::int as promo,
           max(event_name) as event
    from sales_daily where category_id = ${c.category_id} and store_id = any(${c.store_ids})
      and date between ${c.data_as_of}::date - 120 and ${c.data_as_of}::date
    group by date order by date`;
  const ops = await sql`
    select date::text, sum(on_hand)::float as on_hand, sum(inbound)::float as inbound, round(avg(fill_rate), 2)::float as fill_rate,
           round(avg(fulfillment_capacity_pct), 1)::float as fulfillment, count(*)::int as stores
    from ops_daily where category_id = ${c.category_id} and store_id = any(${c.store_ids})
      and date between ${c.data_as_of}::date - 60 and ${c.data_as_of}::date
    group by date order by date`;
  const dc = await sql`
    select date::text, dc_id, utilization_pct::float as util from dc_daily
    where dc_id in (select distinct dc_id from stores where store_id = any(${c.store_ids}))
      and date between ${c.data_as_of}::date - 60 and ${c.data_as_of}::date order by date`;
  return Response.json({ sales, ops, dc });
}

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const p = await getSession();
  redirect(p ? "/overview" : "/login");
}

import "./env";
import { db } from "@/lib/db";
const q = process.argv.slice(2).join(" ");
db().query(q).then((r) => console.table(r)).catch((e) => console.error(e.message));

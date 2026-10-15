import "./env";
import { createHash, createHmac } from "node:crypto";
const secret = process.env.SESSION_SECRET || createHash("sha256").update(`lighthouse:${process.env.DATABASE_URL ?? "dev"}`).digest("hex");
const body = Buffer.from(JSON.stringify({ pid: process.argv[2] ?? "maya", iat: Date.now() })).toString("base64url");
process.stdout.write(`${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`);

// Load .env.local for local scripts (Next.js loads it automatically for the app).
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

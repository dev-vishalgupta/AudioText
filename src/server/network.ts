import "server-only";
import { setDefaultResultOrder } from "node:dns";
import { setDefaultAutoSelectFamily } from "node:net";

/** Prefer the working IPv4 route on local networks with broken IPv6 routing. */
export function configureGoogleNetwork() {
  if (process.env.AUDIOTEXT_NETWORK_FAMILY === "auto") return;
  setDefaultResultOrder("ipv4first");
  setDefaultAutoSelectFamily(false);
}

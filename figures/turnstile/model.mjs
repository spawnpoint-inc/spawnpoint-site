// Who the gate lets in. This is the rule spawnpoint applies to every
// project: the owner always gets in, a public project lets anyone in, and a
// shared one lets in the emails on its list or anyone at a shared domain.
// Everyone the gate admits, except the owner and on a public project, first
// gets a one-time code by email.

export const DOMAIN = "acme.com";
export const LISTED = ["ana@acme.com"];

export const MODES = [
  // screen: the word the reader shows while it waits, who may come in.
  { id: "private", word: "private", screen: "YOU", say: "Private: only you get in" },
  { id: "people", word: "ana only", screen: "ANA", say: "Shared with ana@acme.com: only she gets in, with a code by email" },
  { id: "domain", word: "@acme.com", screen: "@ACME", say: "Shared with @acme.com: anyone at acme.com gets in, with a code by email" },
  { id: "public", word: "public", screen: "ALL", say: "Public: anyone with the link gets in" },
];

export const PEOPLE = [
  { id: "you", email: "you@acme.com", owner: true },
  { id: "bob", email: "bob@gmail.com" },
  { id: "ana", email: "ana@acme.com" },
  { id: "sam", email: "sam@acme.com" },
];

// How a person meets the gate in a mode: "owner", "open" (public, no check),
// "code" (a code goes to their inbox, then they are in) or "out".
export function verdict(mode, person) {
  if (person.owner) return "owner";
  if (mode === "public") return "open";
  if (mode === "people" && LISTED.includes(person.email)) return "code";
  if (mode === "domain" && person.email.endsWith("@" + DOMAIN)) return "code";
  return "out";
}

// The idle tour: one mode per badge, so each mode shows someone getting in
// and someone kept out. The queue starts you, bob, ana, sam (front first);
// a badge that is kept out goes to the back of the queue.
export const TOUR = ["private", "private", "people", "people", "domain", "domain", "public"];

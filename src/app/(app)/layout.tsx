import { redirect } from "next/navigation";

import { TestBanner } from "@/components/test-banner";
import { getAccessMap, requireUser } from "@/lib/access";

import { Sidebar } from "./sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Solange das Erstpasswort gilt, kennt es die Person, die das Konto angelegt
  // hat. Erst nach dem eigenen Wechsel geht es weiter. /passwort liegt bewusst
  // ausserhalb dieses Layouts, sonst würde die Weiterleitung kreisen.
  if (user.mustChangePassword) redirect("/passwort");

  const access = await getAccessMap(user);

  return (
    <>
      <TestBanner />
      <div className="min-h-screen md:flex">
        <Sidebar user={user} access={access} />
        <main className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </>
  );
}

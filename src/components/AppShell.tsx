"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import type { Space } from "@/lib/spaces";

function detectSpace(pathname: string): Space {
  if (pathname.startsWith("/pro")) return "pro";
  if (pathname.startsWith("/perso")) return "perso";
  return "all";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [space, setSpace] = useState<Space>(() => detectSpace(pathname));

  // Hide shell on login page
  if (pathname === "/login") return <>{children}</>;

  useEffect(() => {
    setSpace(detectSpace(pathname));
  }, [pathname]);

  function handleSpaceChange(newSpace: Space) {
    setSpace(newSpace);
    if (newSpace === "pro") router.push("/pro");
    else if (newSpace === "perso") router.push("/perso");
    else router.push("/");
  }

  return (
    <>
      <Sidebar space={space} onSpaceChange={handleSpaceChange} />
      <MobileNav space={space} onSpaceChange={handleSpaceChange} />
      <div className="md:ml-56 mt-12 md:mt-0 min-h-screen">
        {children}
      </div>
    </>
  );
}

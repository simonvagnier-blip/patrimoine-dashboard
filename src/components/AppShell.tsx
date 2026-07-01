"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import MobileTabBar from "./MobileTabBar";
import { type Space, SPACES } from "@/lib/spaces";

function detectSpace(pathname: string): Space {
  if (pathname.startsWith("/pro")) return "pro";
  if (pathname.startsWith("/perso")) return "perso";
  return "all";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [space, setSpace] = useState<Space>(() => detectSpace(pathname));

  useEffect(() => {
    setSpace(detectSpace(pathname));
  }, [pathname]);

  // Rules of Hooks : ce return anticipé DOIT venir après tous les hooks, sinon
  // le nombre de hooks change entre /login et les autres pages (React error).
  if (pathname === "/login") return <>{children}</>;

  function handleSpaceChange(newSpace: Space) {
    setSpace(newSpace);
    if (newSpace === "pro") router.push("/pro");
    else if (newSpace === "perso") router.push("/perso");
    else router.push("/");
  }

  const config = SPACES[space];

  return (
    <>
      <Sidebar space={space} onSpaceChange={handleSpaceChange} />
      <MobileNav space={space} onSpaceChange={handleSpaceChange} />
      <MobileTabBar space={space} />
      <div
        className="md:ml-56 mt-12 md:mt-0 pb-16 md:pb-0 min-h-screen transition-colors duration-300"
        style={{ backgroundColor: config.bg }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}

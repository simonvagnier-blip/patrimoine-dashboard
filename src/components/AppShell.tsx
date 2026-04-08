"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
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

  const config = SPACES[space];

  return (
    <>
      <Sidebar space={space} onSpaceChange={handleSpaceChange} />
      <MobileNav space={space} onSpaceChange={handleSpaceChange} />
      <div
        className="md:ml-56 mt-12 md:mt-0 min-h-screen transition-colors duration-300"
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

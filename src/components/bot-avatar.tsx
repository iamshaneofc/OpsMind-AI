"use client";

import { Bot } from "lucide-react";
import { motion } from "framer-motion";

export function BotAvatar() {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0.8 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="relative flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/45 bg-cyan-400/10 text-cyan-300 shadow-[0_0_24px_-8px_rgba(34,211,238,0.9)]"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Number.POSITIVE_INFINITY, ease: "linear", duration: 10 }}
        className="absolute inset-0 rounded-full border border-cyan-300/30 border-t-cyan-200/90"
      />
      <Bot size={24} />
    </motion.div>
  );
}

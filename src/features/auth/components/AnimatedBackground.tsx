import React from "react";
import { motion } from "motion/react";

/** Premium animated auth background with subtle floating glow */
export const AnimatedBackground = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden">
    <div className="absolute inset-0 gp-auth-exec-bg-dark" />
    <motion.div
      className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-500/10 blur-3xl"
      animate={{ x: [0, 12, 0], y: [0, -8, 0], opacity: [0.5, 0.75, 0.5] }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
    />
    <motion.div
      className="absolute bottom-0 -left-16 w-64 h-64 rounded-full bg-amber-500/8 blur-3xl"
      animate={{ x: [0, -10, 0], y: [0, 6, 0], opacity: [0.4, 0.65, 0.4] }}
      transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
    />
  </div>
);

export { PremiumAuthBackground, ClassicAuthBackground, AuthBackground, ParticleBackground } from "../SplashScreen";

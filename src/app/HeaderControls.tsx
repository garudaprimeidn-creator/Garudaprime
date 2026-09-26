import { Moon, Sun } from "lucide-react";
import { useLanguage } from "./LanguageContext";
import { useTheme } from "./ThemeContext";
import { LanguageToggle } from "./LanguageToggle";

export const HeaderControls = ({ className = "" }: { className?: string }) => {
  const { isDark, toggleTheme } = useTheme();
  const { t } = useLanguage();

  return (
    <div className={`gp-header-controls ${className}`}>
      <button
        type="button"
        onClick={toggleTheme}
        className="gp-header-controls__btn"
        aria-label={isDark ? t.theme.light : t.theme.dark}
        title={isDark ? t.theme.light : t.theme.dark}
      >
        {isDark ? (
          <Sun className="w-[15px] h-[15px] text-amber-500" strokeWidth={2.3} />
        ) : (
          <Moon className="w-[15px] h-[15px] text-indigo-600" strokeWidth={2.3} />
        )}
      </button>
      <span className="gp-header-controls__divider" aria-hidden="true" />
      <LanguageToggle variant="header" />
    </div>
  );
};

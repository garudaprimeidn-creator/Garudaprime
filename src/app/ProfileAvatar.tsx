import React, { useRef } from "react";
import { Camera } from "lucide-react";
import { useApp } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { profileInitials } from "./profileData";

const SIZE_MAP = {
  topbar: { box: "w-7 h-7", text: "text-[10px]", icon: "w-3 h-3", cam: "w-4 h-4" },
  xs: { box: "w-8 h-8", text: "text-xs", icon: "w-3 h-3", cam: "w-4 h-4" },
  sm: { box: "w-10 h-10", text: "text-sm", icon: "w-3.5 h-3.5", cam: "w-5 h-5" },
  md: { box: "w-12 h-12", text: "text-xl", icon: "w-4 h-4", cam: "w-6 h-6" },
  lg: { box: "w-16 h-16", text: "text-2xl", icon: "w-5 h-5", cam: "w-7 h-7" },
} as const;

type ProfileAvatarProps = {
  size?: keyof typeof SIZE_MAP;
  editable?: boolean;
  className?: string;
  rounded?: "xl" | "2xl" | "full";
};

export const ProfileAvatar = ({
  size = "md",
  editable = false,
  className = "",
  rounded = "2xl",
}: ProfileAvatarProps) => {
  const { profilePhotoUrl, profileName, uploadProfilePhoto, showToast } = useApp();
  const { t } = useLanguage();
  const pp = t.profileDetails;
  const inputRef = useRef<HTMLInputElement>(null);
  const s = SIZE_MAP[size];
  const radius = rounded === "full" ? "rounded-full" : rounded === "xl" ? "rounded-xl" : "rounded-2xl";

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast(pp.photoInvalid, "error");
      e.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast(pp.photoTooLarge, "error");
      e.target.value = "";
      return;
    }
    const ok = await uploadProfilePhoto(file);
    if (ok) showToast(pp.photoUpdated, "success");
    else showToast(pp.photoFailed, "error");
    e.target.value = "";
  };

  return (
    <div className={`relative shrink-0 ${className}`}>
      <div
        className={`${s.box} ${radius} overflow-hidden border border-emerald-500/30 bg-gradient-to-br from-emerald-500/30 to-teal-500/20 flex items-center justify-center`}
      >
        {profilePhotoUrl ? (
          <img src={profilePhotoUrl} alt={profileName} className="w-full h-full object-cover" />
        ) : (
          <span className={`${s.text} font-black text-emerald-400 gp-num`} style={{ fontFamily: "'Outfit',sans-serif" }}>
            {profileInitials(profileName)}
          </span>
        )}
      </div>
      {editable && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`absolute -bottom-1 -right-1 ${s.cam} rounded-full bg-emerald-500 text-black flex items-center justify-center border-2 border-[var(--gp-bg,#0f172a)] shadow-lg active:scale-95 transition-transform`}
            aria-label="Upload photo"
          >
            <Camera className={s.icon} />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFile}
          />
        </>
      )}
    </div>
  );
};

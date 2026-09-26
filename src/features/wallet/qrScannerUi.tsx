export const ViewfinderCorners = ({ color = "amber" }: { color?: "amber" | "cyan" | "emerald" }) => {
  const border = color === "cyan"
    ? "border-cyan-400/75"
    : color === "emerald"
      ? "border-emerald-400/75"
      : "border-amber-400/75";
  const corner = `absolute w-5 h-5 ${border}`;
  return (
    <>
      <div className={`${corner} top-2 left-2 border-t-[2.5px] border-l-[2.5px] rounded-tl-lg`} />
      <div className={`${corner} top-2 right-2 border-t-[2.5px] border-r-[2.5px] rounded-tr-lg`} />
      <div className={`${corner} bottom-2 left-2 border-b-[2.5px] border-l-[2.5px] rounded-bl-lg`} />
      <div className={`${corner} bottom-2 right-2 border-b-[2.5px] border-r-[2.5px] rounded-br-lg`} />
    </>
  );
};

type Option = { value: string; label: string };

type Props = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

/** Compact single-line picker, shows only the selected value until opened. */
export const SelectionPills = ({
  options,
  value,
  onChange,
  className = "",
}: Props) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`mt-1.5 w-full px-3 py-2.5 rounded-xl gp-input border text-sm appearance-none bg-no-repeat ${className}`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
      backgroundPosition: "right 0.75rem center",
      backgroundSize: "1rem",
      paddingRight: "2.25rem",
    }}
  >
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);

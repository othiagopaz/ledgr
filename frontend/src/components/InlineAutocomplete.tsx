import { useState, useRef, useEffect } from "react";

export default function InlineAutocomplete({
  value,
  onChange,
  onSelect,
  options,
  placeholder,
  inputRef,
  onKeyDown,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (v: string) => void;
  options: string[];
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = value
    ? options
        .filter((o) => o.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 15)
    : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="autocomplete-wrapper" ref={wrapperRef}>
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIdx(-1);
        }}
        onFocus={() => value && setOpen(true)}
        onKeyDown={(e) => {
          if (open && filtered.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Enter" && activeIdx >= 0) {
              e.preventDefault();
              e.stopPropagation();
              const selected = filtered[activeIdx];
              onChange(selected);
              onSelect?.(selected);
              setOpen(false);
              return;
            }
          }
          onKeyDown?.(e);
        }}
      />
      {open && filtered.length > 0 && (
        <div className="autocomplete-list">
          {filtered.map((item, i) => (
            <div
              key={item}
              className={`item${i === activeIdx ? " active" : ""}`}
              onMouseDown={() => {
                onChange(item);
                onSelect?.(item);
                setOpen(false);
              }}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

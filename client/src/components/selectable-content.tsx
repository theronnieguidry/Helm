import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { User, MapPin, ScrollText } from "lucide-react";
import type { EntityType } from "@shared/entity-detection";

interface SelectableContentProps {
  children: React.ReactNode;
  onCreateEntity: (text: string, type: EntityType) => void;
  disabled?: boolean;
}

interface SelectionPosition {
  x: number;
  y: number;
  text: string;
}

const ENTITY_TYPES: { type: EntityType; label: string; icon: typeof User }[] = [
  { type: "npc", label: "NPC", icon: User },
  { type: "place", label: "Place", icon: MapPin },
  { type: "quest", label: "Quest", icon: ScrollText },
];

export function SelectableContent({
  children,
  onCreateEntity,
  disabled = false,
}: SelectableContentProps) {
  const [selection, setSelection] = useState<SelectionPosition | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseUp = useCallback(() => {
    if (disabled) return;

    const windowSelection = window.getSelection();
    const selectedText = windowSelection?.toString().trim();

    if (!selectedText || selectedText.length < 2 || selectedText.length > 100) {
      setSelection(null);
      setIsOpen(false);
      return;
    }

    // Get the selection range and position
    const range = windowSelection?.getRangeAt(0);
    if (!range) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();

    if (!containerRect) {
      setSelection(null);
      return;
    }

    // Position the popover at the end of the selection
    setSelection({
      x: rect.right - containerRect.left,
      y: rect.bottom - containerRect.top + 4,
      text: selectedText,
    });
    setIsOpen(true);
  }, [disabled]);

  const handleCreateEntity = useCallback(
    (type: EntityType) => {
      if (selection?.text) {
        onCreateEntity(selection.text, type);
        setSelection(null);
        setIsOpen(false);
        window.getSelection()?.removeAllRanges();
      }
    },
    [selection, onCreateEntity]
  );

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setSelection(null);
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative" onMouseUp={handleMouseUp}>
      {children}

      {selection && isOpen && (
        <div
          className="absolute z-50"
          style={{
            left: selection.x,
            top: selection.y,
          }}
        >
          <div className="bg-popover border rounded-lg shadow-lg p-2">
            <div className="text-xs text-muted-foreground mb-2 px-1">
              Create entity from "{selection.text.slice(0, 30)}
              {selection.text.length > 30 ? "..." : ""}"
            </div>
            <div className="flex gap-1">
              {ENTITY_TYPES.map(({ type, label, icon: Icon }) => (
                <Button
                  key={type}
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                  onClick={() => handleCreateEntity(type)}
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

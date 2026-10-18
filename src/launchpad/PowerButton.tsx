import type { CSSProperties, MouseEvent } from "react";
import { CircleArrowDown, Lock, LogOut, Moon, Power, RotateCcw, type LucideIcon } from "lucide-react";
import { api, type PowerAction } from "../lib/api";
import { usePoll } from "../lib/hooks";
import { openMenu, type MenuItem } from "../components/ContextMenu";
import { RoundButton } from "../components/controls";

export function PowerButton({ onAction, style }: { onAction: (action: PowerAction) => void; style?: CSSProperties }) {
  const updates = !!usePoll(api.powerInfo, 60_000)?.updates;
  const item = (label: string, icon: LucideIcon, action: PowerAction): MenuItem => ({ label, icon, onClick: () => onAction(action) });
  const open = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(
      { clientX: r.right, clientY: r.bottom + 8 },
      [
        item("Lock", Lock, "lock"),
        item("Sign Out", LogOut, "signOut"),
        { separator: true },
        item("Sleep", Moon, "sleep"),
        ...(updates ? [item("Update and Shut Down", CircleArrowDown, "updateShutDown")] : []),
        item("Shut Down", Power, "shutDown"),
        ...(updates ? [item("Update and Restart", CircleArrowDown, "updateRestart")] : []),
        item("Restart", RotateCcw, "restart"),
      ],
      true,
    );
  };
  return (
    <RoundButton label={updates ? "Power (updates ready)" : "Power"} onClick={open} badge={updates} style={style}>
      <Power size={16} />
    </RoundButton>
  );
}

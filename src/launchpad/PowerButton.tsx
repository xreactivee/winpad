import type { CSSProperties, MouseEvent } from "react";
import { ArrowRotate, CircleArrowDown, Lock, Logout, Moon, Power, type IconComponent } from "reicon-react";
import { api, type PowerAction } from "../lib/api";
import { usePoll } from "../lib/hooks";
import { openMenu, type MenuItem } from "../components/ContextMenu";
import { RoundButton } from "../components/controls";

export function PowerButton({ onAction, style }: { onAction: (action: PowerAction) => void; style?: CSSProperties }) {
  const updates = !!usePoll(api.powerInfo, 60_000)?.updates;
  const item = (label: string, icon: IconComponent, action: PowerAction): MenuItem => ({ label, icon, onClick: () => onAction(action) });
  const open = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(
      { clientX: r.right, clientY: r.bottom + 8 },
      [
        item("Lock", Lock, "lock"),
        item("Sign Out", Logout, "signOut"),
        { separator: true },
        item("Sleep", Moon, "sleep"),
        ...(updates ? [item("Update and Shut Down", CircleArrowDown, "updateShutDown")] : []),
        item("Shut Down", Power, "shutDown"),
        ...(updates ? [item("Update and Restart", CircleArrowDown, "updateRestart")] : []),
        item("Restart", ArrowRotate, "restart"),
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

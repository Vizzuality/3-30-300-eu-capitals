import type { IconBaseProps, IconType } from "react-icons"
import {
  LuCheck,
  LuChevronLeft,
  LuChevronRight,
  LuMaximize,
  LuMinus,
  LuMousePointer,
  LuPlus,
  LuSearch,
  LuX,
} from "react-icons/lu"

/*
 * The interface's icons, from Lucide (react-icons), each at the size and
 * line weight it is drawn at in the design. They are decorative: the control
 * that holds one carries its name, so they are hidden from screen readers.
 */
function sized(
  Icon: IconType,
  size: number,
  strokeWidth: number,
  look: IconBaseProps = {}
) {
  return function SizedIcon(props: IconBaseProps) {
    return (
      <Icon
        size={size}
        strokeWidth={strokeWidth}
        aria-hidden="true"
        focusable="false"
        {...look}
        {...props}
      />
    )
  }
}

/** Back ("All capitals", "Back to the map") */
export const ChevronLeftIcon = sized(LuChevronLeft, 18, 2.25)

/** Forward (an A–Z row, opening its capital) */
export const ChevronRightIcon = sized(LuChevronRight, 16, 2.25)

/** Search (the A–Z list's field) */
export const SearchIcon = sized(LuSearch, 18, 2.1)

/** Clear (what is typed in a field) */
export const ClearIcon = sized(LuX, 16, 2.25)

/** Close (a selected building) */
export const CloseIcon = sized(LuX, 16, 2.5)

/** Zoom in */
export const PlusIcon = sized(LuPlus, 20, 2.4)

/** Zoom out */
export const MinusIcon = sized(LuMinus, 20, 2.4)

/** "Whole city": the corners of a frame */
export const FrameIcon = sized(LuMaximize, 16, 2.4)

/** Met: a tick, inside its round mark */
export const TickIcon = sized(LuCheck, 8, 4.5)

/** Not met: a dash, inside its round mark */
export const DashIcon = sized(LuMinus, 8, 4.5)

/** The Next step guide's pointer: an arrow, filled, as in the design */
export const PointerIcon = sized(LuMousePointer, 18, 2, {
  fill: "currentColor",
})

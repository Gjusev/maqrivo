import { CalendarBlankIcon } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { HouseIcon } from "@phosphor-icons/react/dist/csr/House";
import { BasketIcon } from "@phosphor-icons/react/dist/csr/Basket";
import { PercentIcon } from "@phosphor-icons/react/dist/csr/Percent";
import { CookingPotIcon } from "@phosphor-icons/react/dist/csr/CookingPot";
import { ArchiveIcon } from "@phosphor-icons/react/dist/csr/Archive";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { MapPinIcon } from "@phosphor-icons/react/dist/csr/MapPin";
import { PackageIcon } from "@phosphor-icons/react/dist/csr/Package";
import { UserCircleIcon } from "@phosphor-icons/react/dist/csr/UserCircle";
import { GearIcon } from "@phosphor-icons/react/dist/csr/Gear";
import type { Icon } from "@phosphor-icons/react";

export interface NavItem {
  key: string; // translation key under Nav
  href: string;
  icon: Icon;
  primary?: boolean; // shown in mobile bottom bar
}

export const NAV_ITEMS: NavItem[] = [
  { key: "today", href: "/", icon: HouseIcon, primary: true },
  { key: "week", href: "/week", icon: CalendarBlankIcon, primary: true },
  { key: "shopping", href: "/shopping", icon: BasketIcon, primary: true },
  { key: "offers", href: "/offers", icon: PercentIcon, primary: true },
  { key: "pantry", href: "/pantry", icon: ArchiveIcon },
  { key: "recipes", href: "/recipes", icon: CookingPotIcon },
  { key: "stores", href: "/stores", icon: MapPinIcon },
  { key: "products", href: "/products", icon: PackageIcon },
  { key: "assistant", href: "/assistant", icon: SparkleIcon },
  { key: "profile", href: "/profile", icon: UserCircleIcon },
  { key: "settings", href: "/settings", icon: GearIcon },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((item) => item.primary);
export const MORE_NAV = NAV_ITEMS.filter((item) => !item.primary);

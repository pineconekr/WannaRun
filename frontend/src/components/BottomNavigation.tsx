import React from "react";

export type NavigationTab = "home" | "run" | "history";

type Props = {
  activeTab: NavigationTab;
  onChange: (tab: NavigationTab) => void;
};

export default function BottomNavigation({
  activeTab,
  onChange,
}: Props) {
  const items: {
    id: NavigationTab;
    label: string;
    icon: string;
  }[] = [
    { id: "home", label: "홈", icon: "⌂" },
    { id: "run", label: "러닝", icon: "▷" },
    { id: "history", label: "기록", icon: "▤" },
  ];

  return (
    <nav className="wr-bottom-nav" aria-label="하단 메뉴">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`wr-nav-item ${
            activeTab === item.id ? "is-active" : ""
          }`}
          aria-current={activeTab === item.id ? "page" : undefined}
          onClick={() => onChange(item.id)}
        >
          <span className="wr-nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
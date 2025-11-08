import { ReactNode, cloneElement, isValidElement, useEffect, useRef } from 'react';

// Import Material Web Components - navigation bar is in labs
import '@material/web/labs/navigationbar/navigation-bar.js';
import '@material/web/labs/navigationtab/navigation-tab.js';

type NavigationTab = {
  label: string;
  icon: ReactNode;
  activeIcon?: ReactNode;
};

interface NavigationBarProps {
  value: number;
  onChange: (index: number) => void;
  tabs: NavigationTab[];
}

const renderIcon = (icon: ReactNode, slot: 'inactive-icon' | 'active-icon') => {
  if (isValidElement(icon)) {
    return cloneElement(icon, {
      slot,
      className: ['nav-svg-icon', icon.props.className].filter(Boolean).join(' '),
    });
  }

  return (
    <span slot={slot} className="nav-icon material-symbols-outlined" aria-hidden="true">
      {icon}
    </span>
  );
};

export const NavigationBar = ({ value, onChange, tabs }: NavigationBarProps) => {
  const navBarRef = useRef<HTMLElement>(null);
  const clickHandlersRef = useRef<Array<{ tab: any; handler: () => void }>>([]);

  // Separate effect to sync activeIndex immediately
  useEffect(() => {
    const navBar = navBarRef.current as any;
    if (!navBar) return;
    
    // Force immediate update of activeIndex
    navBar.activeIndex = value;
    
    // Force style update using requestAnimationFrame to ensure it happens after render
    requestAnimationFrame(() => {
      navBar.activeIndex = value;
    });
  }, [value]);

  useEffect(() => {
    const navBar = navBarRef.current as any;
    if (!navBar) return;

    const handleChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      const activeIndex = customEvent.detail?.activeIndex ?? (navBar as any).activeIndex;
      if (typeof activeIndex === 'number' && activeIndex !== value) {
        onChange(activeIndex);
      }
    };

    navBar.addEventListener('navigation-bar-change', handleChange);
    
    // Also listen to click events on tabs as fallback
    const navTabs = navBar.querySelectorAll('md-navigation-tab');
    clickHandlersRef.current = [];
    
    navTabs.forEach((tab: any, index: number) => {
      const clickHandler = () => {
        // Update immediately
        navBar.activeIndex = index;
        onChange(index);
      };
      tab.addEventListener('click', clickHandler);
      clickHandlersRef.current.push({ tab, handler: clickHandler });
    });

    return () => {
      navBar.removeEventListener('navigation-bar-change', handleChange);
      clickHandlersRef.current.forEach(({ tab, handler }) => {
        tab.removeEventListener('click', handler);
      });
      clickHandlersRef.current = [];
    };
  }, [value, onChange]);

  return (
    // @ts-ignore - Material Web Components are web components
    <md-navigation-bar
      ref={navBarRef}
      activeIndex={value}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
      }}
    >
      {tabs.map((tab, index) => (
        // @ts-ignore - Material Web Components are web components
        <md-navigation-tab key={index} label={tab.label}>
          {renderIcon(tab.icon, 'inactive-icon')}
          {renderIcon(tab.activeIcon ?? tab.icon, 'active-icon')}
        </md-navigation-tab>
      ))}
    </md-navigation-bar>
  );
};

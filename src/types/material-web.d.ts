// `export {}` maakt dit bestand een module, zodat `declare global` de globale JSX-namespace aanvult.
export {};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'md-navigation-bar': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        activeIndex?: number;
      }, HTMLElement>;
      'md-navigation-tab': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        label?: string;
      }, HTMLElement>;
      'md-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        slot?: string;
      }, HTMLElement>;
      'md-filled-button': React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement> & {
        disabled?: boolean;
      }, HTMLButtonElement>;
      'md-text-button': React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement> & {
        disabled?: boolean;
      }, HTMLButtonElement>;
    }
  }
}


/**
 * Scrollbar width calculation and management utilities
 * Addresses the horizontal scrollbar issue when vertical scrollbar appears
 */

/**
 * Calculate the scrollbar width for the current browser/environment
 */
export function getScrollbarWidth(): number {
    // Create a temporary div to measure scrollbar width
    const outer = document.createElement('div');
    outer.style.visibility = 'hidden';
    outer.style.overflow = 'scroll';
    document.body.appendChild(outer);

    const inner = document.createElement('div');
    outer.appendChild(inner);

    const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;
    outer.parentNode?.removeChild(outer);

    return scrollbarWidth;
}

/**
 * Set scrollbar width as CSS custom property
 */
export function setScrollbarWidthProperty(): void {
    const scrollbarWidth = getScrollbarWidth();
    document.documentElement.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
    console.log(`Scrollbar width detected: ${scrollbarWidth}px`);
}

/**
 * Apply scrollbar compensation to the app container
 */
export function applyScrollbarCompensation(): void {
    const scrollbarWidth = getScrollbarWidth();
    const appElement = document.querySelector('.app') as HTMLElement;
    
    if (appElement && scrollbarWidth > 0) {
        // Method 1: Adjust width dynamically
        const adjustedWidth = 320 - scrollbarWidth;
        appElement.style.setProperty('--app-width', `${adjustedWidth}px`);
        
        // Method 2: Add padding compensation
        appElement.style.setProperty('--scrollbar-compensation', `${scrollbarWidth}px`);
        
        console.log(`Applied scrollbar compensation: ${scrollbarWidth}px`);
    }
}

/**
 * Initialize scrollbar management
 */
export function initScrollbarManagement(): void {    // Set properties immediately
    setScrollbarWidthProperty();
    applyScrollbarCompensation();
    
    // Re-apply on window resize (for cases where scrollbar appearance changes)
    let resizeTimeout: ReturnType<typeof setTimeout>;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            setScrollbarWidthProperty();
            applyScrollbarCompensation();
        }, 100);
    });
    
    // Also listen for content changes that might affect scrolling
    const observer = new MutationObserver(() => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            applyScrollbarCompensation();
        }, 50);
    });
    
    const appElement = document.querySelector('.app');
    if (appElement) {
        observer.observe(appElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    }
}

/**
 * Check if the element has a vertical scrollbar
 */
export function hasVerticalScrollbar(element: HTMLElement): boolean {
    return element.scrollHeight > element.clientHeight;
}

/**
 * Force scrollbar space reservation
 */
export function forceScrollbarSpace(element: HTMLElement): void {
    const scrollbarWidth = getScrollbarWidth();
    if (scrollbarWidth > 0) {
        element.style.paddingRight = `${scrollbarWidth}px`;
        element.style.width = `calc(100% - ${scrollbarWidth}px)`;
        element.style.boxSizing = 'border-box';
    }
}

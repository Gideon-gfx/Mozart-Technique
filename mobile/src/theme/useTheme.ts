// Re-exported from ThemeContext so the 20+ existing `import { useTheme }
// from '../theme/useTheme'` call sites don't all need touching - the actual
// implementation (including the Color Theme override) lives there now.
export { useTheme } from './ThemeContext';

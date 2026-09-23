// Light palette mirrors the web app's brand colors (public/assets/site.css
// / redesign.css). primaryGradient matches nav-auth.js's own
// ".mt-auth-login-btn" treatment exactly (linear-gradient(135deg, #c41822,
// #ff3342)) - that's the actual signature red used on every primary CTA
// across the site, not the flatter #cc0000 used for smaller accents.
export const lightColors = {
  primaryRed: '#c41822',
  primaryRedDark: '#a30000',
  primaryGradient: ['#c41822', '#ff3342'] as const,
  onPrimary: '#FFFFFF',
  background: '#FBF7F0',
  surface: '#FFFFFF',
  text: '#17130F',
  textSoft: '#5B5449',
  textFaint: '#9C9384',
  border: '#E7DFD3',
  danger: '#DC2626',
  success: '#059669',
  statusPendingBg: '#FEF3C7',
  statusPendingText: '#92400E',
  statusActiveBg: '#D1FAE5',
  statusActiveText: '#065F46',
  // Onboarding device mockups (phone/laptop/TV frames): dark frame on the
  // light theme, silver/brushed-metal on the dark theme - deliberately the
  // opposite of what you'd guess, so the frame always reads against its
  // background instead of blending into it.
  deviceFrame: ['#2c2c30', '#0c0c0e', '#1c1c1f'] as [string, string, string],
  deviceEdge: 'rgba(255,255,255,0.07)',
  deviceShadow: 'rgba(0,0,0,0.5)',
};

// True black, not a warm/near-black - a previous pass used a background
// with a slight brown cast (#141110) that read as "dim brown" rather than
// black. Surface/border stay neutral greys too, not warm-tinted, so
// nothing in the dark theme carries that cast.
export const darkColors = {
  primaryRed: '#FF3342',
  primaryRedDark: '#FF6B78',
  primaryGradient: ['#c41822', '#ff3342'] as const,
  onPrimary: '#FFFFFF',
  background: '#000000',
  surface: '#121212',
  text: '#F5F5F5',
  textSoft: '#B8B8B8',
  textFaint: '#7A7A7A',
  border: '#2A2A2A',
  danger: '#F87171',
  success: '#34D399',
  statusPendingBg: '#3A2E12',
  statusPendingText: '#FBBF24',
  statusActiveBg: '#0F3A2A',
  statusActiveText: '#34D399',
  deviceFrame: ['#f4f4f6', '#b7b7bd', '#e2e2e6'] as [string, string, string],
  deviceEdge: 'rgba(0,0,0,0.3)',
  deviceShadow: 'rgba(0,0,0,0.7)',
};

export type ThemeColors = typeof lightColors;

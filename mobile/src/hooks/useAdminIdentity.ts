import { useAuth } from '../context/AuthContext';
import { useRoleMode } from '../context/RoleModeContext';

// The single source of truth every admin screen reads instead of raw
// user.isPrimaryAdmin/adminCountryCode fields - folds in RoleModeContext's
// `adminViewAs` so an account holding both hats (a primary admin whose
// email is also owner-allowlisted, see server.js's isPrimaryAdmin) gets a
// console that actually reflects whichever Profile row it tapped, not
// always the wider one. Purely a display/self-filter choice: it can only
// ever narrow a real primary admin's own view (by asking the server for
// their own country's slice, same as AdminRegionFilter would), never widen
// a real country admin's - so nothing here weakens server-side enforcement.
export function useAdminIdentity() {
  const { user } = useAuth();
  const { adminViewAs } = useRoleMode();
  const viewingAsCountry = adminViewAs === 'country' && Boolean(user?.adminCountryCode);
  const isPrimary = Boolean(user?.isPrimaryAdmin) && !viewingAsCountry;
  return {
    isPrimary,
    countryCode: user?.adminCountryCode || null,
    countryName: user?.adminCountryName || null,
  };
}

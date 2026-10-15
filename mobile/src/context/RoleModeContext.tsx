import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { setAdminRequestView } from '../api/client';

export type RoleMode = 'student' | 'tutor' | 'org-tutor' | 'sponsor' | 'org-student' | 'organization' | 'admin' | 'performer' | 'support-agent';

interface RoleModeContextValue {
  mode: RoleMode;
  // Which organization's workspace is active while mode is 'org-tutor' or
  // 'org-student' - an account can hold that relationship to more than one
  // organization (see Profile's per-org "<org name> Tutor"/"<org name>
  // Student" rows), so the mode alone isn't enough to know which one to load.
  activeOrgId: number | null;
  switchToTutor: () => void;
  switchToStudent: () => void;
  switchToOrgTutor: (orgId: number) => void;
  switchToSponsor: () => void;
  switchToOrgStudent: (orgId: number) => void;
  // Organization is its own mode, deliberately separate from 'sponsor' -
  // Sponsor is an Individual Sponsor's one-student relationship; Organization
  // is the NGO/Institution's own dashboard (students, tutors, classroom).
  // No orgId param needed: like switchToSponsor, this is always the
  // account's own owned org, resolved server-side by user id, not by
  // membership - an account owns at most one.
  switchToOrganization: () => void;
  // Country Admin and Main Admin share this same mode/tabs (the admin
  // console adapts to the account's actual permissions server-side, same
  // as the web app's single /admin page) - not two separate modes. An
  // account that holds BOTH hats (a primary admin whose email is also
  // owner-allowlisted, per server.js's isPrimaryAdmin) can still tell the
  // two Profile rows apart: `adminViewAs` records which row was tapped, so
  // the console can present the narrower Country Admin view on request
  // even though the server would always grant the wider one - see
  // useAdminIdentity, which every admin screen reads instead of the raw
  // user fields so this stays consistent everywhere. Real permission
  // enforcement never depends on this - it's a display/self-filter choice
  // only, safe because it can only ever narrow what a real primary admin
  // already has, never widen a real country admin's own restrictions.
  switchToAdmin: (viewAs?: 'primary' | 'country') => void;
  adminViewAs: 'primary' | 'country' | null;
  switchToPerformer: () => void;
  switchToSupportAgent: () => void;
}

const RoleModeContext = createContext<RoleModeContextValue | undefined>(undefined);

// Tapping "Tutor Profile", "Sponsor Dashboard", or one of the "<org name>
// Tutor"/"<org name> Student" rows swaps the whole app shell over to that
// role's own tabs/dashboard, not just one screen - MainStack's Tabs route
// reads this to decide which bottom-tab navigator to mount. Resets to
// 'student' on every cold start by design (in-memory only, not persisted) -
// the same way the real tutor.html/dashboard.html/org-tutor.html/
// become-sponsor.html/my-organization.html are just separate pages someone
// navigates between, not a sticky app-wide setting.
export function RoleModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<RoleMode>('student');
  const [activeOrgId, setActiveOrgId] = useState<number | null>(null);
  const [adminViewAs, setAdminViewAs] = useState<'primary' | 'country' | null>(null);

  const switchToTutor = useCallback(() => {
    setAdminRequestView(null);
    setActiveOrgId(null);
    setMode('tutor');
  }, []);
  const switchToStudent = useCallback(() => {
    setAdminRequestView(null);
    setActiveOrgId(null);
    setMode('student');
  }, []);
  const switchToOrgTutor = useCallback((orgId: number) => {
    setAdminRequestView(null);
    setActiveOrgId(orgId);
    setMode('org-tutor');
  }, []);
  const switchToSponsor = useCallback(() => {
    setAdminRequestView(null);
    setActiveOrgId(null);
    setMode('sponsor');
  }, []);
  const switchToOrgStudent = useCallback((orgId: number) => {
    setAdminRequestView(null);
    setActiveOrgId(orgId);
    setMode('org-student');
  }, []);
  const switchToOrganization = useCallback(() => {
    setAdminRequestView(null);
    setActiveOrgId(null);
    setMode('organization');
  }, []);
  const switchToAdmin = useCallback((viewAs?: 'primary' | 'country') => {
    setAdminRequestView(viewAs || null);
    setActiveOrgId(null);
    setAdminViewAs(viewAs || null);
    setMode('admin');
  }, []);
  const switchToPerformer = useCallback(() => {
    setAdminRequestView(null);
    setActiveOrgId(null);
    setMode('performer');
  }, []);
  const switchToSupportAgent = useCallback(() => {
    setAdminRequestView(null);
    setActiveOrgId(null);
    setMode('support-agent');
  }, []);

  const value = useMemo(
    () => ({
      mode, activeOrgId, switchToTutor, switchToStudent, switchToOrgTutor, switchToSponsor, switchToOrgStudent,
      switchToOrganization, switchToAdmin, adminViewAs, switchToPerformer, switchToSupportAgent,
    }),
    [mode, activeOrgId, switchToTutor, switchToStudent, switchToOrgTutor, switchToSponsor, switchToOrgStudent,
      switchToOrganization, switchToAdmin, adminViewAs, switchToPerformer, switchToSupportAgent],
  );

  return <RoleModeContext.Provider value={value}>{children}</RoleModeContext.Provider>;
}

export function useRoleMode() {
  const ctx = useContext(RoleModeContext);
  if (!ctx) throw new Error('useRoleMode must be used within a RoleModeProvider');
  return ctx;
}

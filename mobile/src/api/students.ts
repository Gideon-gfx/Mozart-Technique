import { apiFetch } from './client';

// Deliberately narrow - server.js only ever exposes name/photo/ageGroup/
// city on this route unless the viewer is the student themself or an
// admin, so no email or phone can leak through it either way.
export interface StudentPublicProfile {
  id: number;
  name: string;
  photoUrl: string | null;
  studentProfile: { ageGroup: string | null; city: string | null } | null;
}

export function fetchStudentPublicProfile(id: number) {
  return apiFetch<{ success: true; student: StudentPublicProfile }>(`/api/students/${id}/public`);
}

// Country name -> international calling code, for phone fields that show a
// fixed, read-only dial-code prefix derived from the org's own location
// (not the viewer's device/IP) followed by an editable local number - e.g.
// Nigeria -> "+234" then up to 10 digits. Keyed by the same country name
// strings data/geo.js already resolves addresses to, so no extra lookup is
// needed beyond what's already stored on the org record.
const DIAL_CODES: Record<string, string> = {
  Nigeria: '+234', Ghana: '+233', Kenya: '+254', 'South Africa': '+27', Egypt: '+20',
  Ethiopia: '+251', Uganda: '+256', Tanzania: '+255', Rwanda: '+250', Senegal: '+221',
  'Ivory Coast': '+225', "Cote d'Ivoire": '+225', Cameroon: '+237', Zambia: '+260', Zimbabwe: '+263',
  Morocco: '+212', Algeria: '+213', Tunisia: '+216', Sudan: '+249', Angola: '+244',
  'United States': '+1', 'United States of America': '+1', Canada: '+1',
  'United Kingdom': '+44', Ireland: '+353', France: '+33', Germany: '+49', Spain: '+34',
  Italy: '+39', Portugal: '+351', Netherlands: '+31', Belgium: '+32', Switzerland: '+41',
  Sweden: '+46', Norway: '+47', Denmark: '+45', Finland: '+358', Poland: '+48',
  India: '+91', Pakistan: '+92', Bangladesh: '+880', China: '+86', Japan: '+81',
  'South Korea': '+82', Philippines: '+63', Indonesia: '+62', Malaysia: '+60', Singapore: '+65',
  Thailand: '+66', Vietnam: '+84', 'United Arab Emirates': '+971', 'Saudi Arabia': '+966', Qatar: '+974',
  Australia: '+61', 'New Zealand': '+64', Brazil: '+55', Mexico: '+52', Argentina: '+54',
  Colombia: '+57', Jamaica: '+1876', Trinidad: '+1868',
};

export function dialCodeForCountry(countryName?: string | null): string {
  if (!countryName) return '+';
  return DIAL_CODES[countryName] || '+';
}

// Splits a full stored phone number ("+234 8012345678") into its dial code
// and local digits, using the org's own known dial code to strip the
// prefix reliably even if it was saved without a space.
export function splitPhone(fullPhone: string | null | undefined, dialCode: string): string {
  if (!fullPhone) return '';
  const trimmed = fullPhone.trim();
  if (dialCode !== '+' && trimmed.startsWith(dialCode)) return trimmed.slice(dialCode.length).replace(/\D/g, '');
  return trimmed.replace(/\D/g, '').slice(-10);
}

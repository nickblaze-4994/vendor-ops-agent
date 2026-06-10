// Deterministic vendor identity verification.
// A vendor is "verified" when the sender email maps to an approved contact
// (strong) or at least an approved email domain (acceptable) for a known vendor.
import { findVendorByEmail, findVendorById } from './apLookup.js';

const norm = (s) => String(s ?? '').trim().toLowerCase();

export function verifyVendor({ senderEmail, vendorIdHint } = {}) {
  const vendor = findVendorByEmail(senderEmail) || findVendorById(vendorIdHint);

  if (!vendor) {
    return { verified: false, vendor: null, method: 'none', reason: 'no_matching_vendor' };
  }

  const e = norm(senderEmail);
  const exact = vendor.approved_contacts.some((c) => norm(c) === e);
  const domain = e.split('@')[1] || '';
  const domainMatch = vendor.email_domains.some((d) => norm(d) === domain);

  if (exact) return { verified: true, vendor, method: 'approved_contact' };
  if (domainMatch) return { verified: true, vendor, method: 'approved_domain' };

  // Vendor was found only via id hint, sender does not match — treat as unverified.
  return { verified: false, vendor, method: 'id_hint_only', reason: 'sender_not_on_approved_list' };
}

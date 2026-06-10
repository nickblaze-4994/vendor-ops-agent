// Canned demo scenarios from the spec. The UI lists these as one-click examples.
// senderEmail is set so identity verification passes for the inbound cases.
export const SCENARIOS = [
  {
    group: 'Payment Inquiry',
    items: [
      { label: 'Where is payment for invoice 8842?', senderEmail: 'ap@acme-industrial.com',
        message: 'Hi, can you check where payment for invoice 8842 is? We have not received it yet.' },
      { label: 'Not received INV-1007', senderEmail: 'ap@acme-industrial.com',
        message: 'We have not received payment for INV-1007. Can you check?' },
      { label: 'Why invoice 5002 not paid', senderEmail: 'ap@acme-industrial.com',
        message: 'Why was invoice 5002 not paid yet?' },
    ],
  },
  {
    group: 'Remittance',
    items: [
      { label: 'Resend remittance for P9001', senderEmail: 'ap@acme-industrial.com',
        message: 'Can you resend remittance for payment P9001?' },
      { label: 'What is in the $8,200 payment', senderEmail: 'ap@brightway.com',
        message: 'What invoices are included in the $8,200 payment from yesterday?' },
      { label: 'Mystery deposit', senderEmail: 'ap@brightway.com',
        message: 'We received a deposit but do not know what it is for.' },
    ],
  },
  {
    group: 'Vendor Outreach',
    items: [
      { label: 'Batch onboarding follow-up', senderEmail: 'ops@corpay-internal.com',
        message: 'Send onboarding follow-up to vendors not enrolled for electronic payment.' },
      { label: 'Ask ABC Supplies to switch', senderEmail: 'ops@corpay-internal.com',
        message: 'Ask ABC Supplies to switch from check to ACH or virtual card.' },
    ],
  },
  {
    group: 'Failed Payments',
    items: [
      { label: 'P9003 ACH return — invalid account', senderEmail: 'rail-events@corpay-internal.com',
        message: 'Payment P9003 failed because the ACH account number is invalid.' },
      { label: 'Virtual card not processed', senderEmail: 'ap@brightway.com',
        message: 'Vendor says the virtual card payment could not be processed.' },
      { label: 'Check P7701 not cashed (20d)', senderEmail: 'rail-events@corpay-internal.com',
        message: 'Check P7701 has not been cashed after 20 days.' },
    ],
  },
  {
    group: 'Reconciliation',
    items: [
      { label: 'ERP unpaid vs P9001 settled', senderEmail: 'erp-events@corpay-internal.com',
        message: 'ERP says INV-8842 is unpaid, but payment P9001 settled.' },
      { label: 'Posted in Corpay, missing in GL', senderEmail: 'erp-events@corpay-internal.com',
        message: 'Payment posted in Corpay but not in the general ledger.' },
    ],
  },
  {
    group: 'Vendor Data Updates',
    items: [
      { label: 'Billing address update', senderEmail: 'accounts@abc-supplies.com',
        message: 'We need to update our billing address.' },
      { label: 'Tax form update', senderEmail: 'ap@brightway.com',
        message: 'Please update our tax form for this year.' },
      { label: 'Changed banks (must escalate)', senderEmail: 'ap@acme-industrial.com',
        message: 'We changed banks. Please update our account details.' },
    ],
  },
  {
    group: 'Invoice Exceptions',
    items: [
      { label: 'INV-5002 vs PO-3002 mismatch', senderEmail: 'ap-events@corpay-internal.com',
        message: 'Invoice INV-5002 is $50,000, but PO PO-3002 is $45,000.' },
      { label: 'INV-9004 has no PO', senderEmail: 'ap-events@corpay-internal.com',
        message: 'Invoice INV-9004 has no PO number.' },
      { label: 'INV-7777 possible duplicate', senderEmail: 'ap-events@corpay-internal.com',
        message: 'Invoice INV-7777 appears to be a duplicate.' },
    ],
  },
  {
    group: 'Approvals & Payment Risk',
    items: [
      { label: 'INV-7004 stuck approval, due soon', senderEmail: 'ap-events@corpay-internal.com',
        message: 'Invoice INV-7004 has been pending approval for 5 days and is due in 2 days.' },
      { label: 'INV-1009 similar to INV-1008', senderEmail: 'ap-events@corpay-internal.com',
        message: 'Invoice INV-1009 looks similar to invoice INV-1008 from the same vendor.' },
      { label: 'INV-2210 due tomorrow, unapproved', senderEmail: 'ap-events@corpay-internal.com',
        message: 'Invoice INV-2210 is due tomorrow but is not approved.' },
    ],
  },
  {
    group: 'Method Optimization',
    items: [
      { label: 'V1005 accepts card, paid by check', senderEmail: 'ops@corpay-internal.com',
        message: 'Vendor V1005 accepts virtual card but is still paid by check.' },
      { label: 'Find check→electronic candidates', senderEmail: 'ops@corpay-internal.com',
        message: 'Find vendors that should be moved from check to electronic payment.' },
    ],
  },
  {
    group: 'Escalation (must NOT auto-resolve)',
    items: [
      { label: 'Bank account change', senderEmail: 'ap@acme-industrial.com',
        message: 'Please update our bank account to this new account number 12345678.' },
      { label: 'Wrong amount / missing $5,000', senderEmail: 'ap@acme-industrial.com',
        message: 'You paid the wrong amount. We are missing $5,000.' },
      { label: 'Looks fraudulent', senderEmail: 'ap@acme-industrial.com',
        message: 'This payment looks fraudulent.' },
      { label: 'Approve this payment (forbidden)', senderEmail: 'ap@acme-industrial.com',
        message: 'Please approve this payment today.' },
    ],
  },
];

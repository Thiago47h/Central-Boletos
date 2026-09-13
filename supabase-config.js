// Public browser configuration. Never place a service_role or secret key here.
// Import this module when implementing authenticated CRUD and Storage.
// This file alone does not migrate or change existing IndexedDB data.
export const supabaseConfig = Object.freeze({
  url: "https://mgwrovpwoqzzgfcwisfu.supabase.co",
  publishableKey: "sb_publishable_HSX0TcfcQJKfZ1eDowcvOw_tf9dRztB",
  table: "boletos",
  buckets: Object.freeze({ bills: "boletos", receipts: "comprovantes" })
});
// Storage paths must use: authenticatedUser.id + "/" + uniqueFileName.
